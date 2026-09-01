import * as vscode from "vscode";
import { normalizeError } from "@nexus/ai-core";
import { ModelSelection, ReadOnlyChatRuntime } from "./readOnlyChatRuntime";
import { ConversationStore } from "./conversationStore";
import { WorkspaceContextCollector } from "./workspaceContext";
import { ContextAttachment, ContextKind } from "./workspaceContextTypes";

type ChatMode = "ask" | "agent" | "design";

type WebviewMessage =
    | { type: "ready" }
    | { type: "send"; prompt: string; mode: ChatMode; harness: string; model: ModelSelection }
    | { type: "attach"; kind: ContextKind }
    | { type: "removeAttachment"; id: string }
    | { type: "regenerate" }
    | { type: "newConversation" }
    | { type: "selectConversation"; id: string }
    | { type: "stop" };

export class NexusChatViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private activeRun?: AbortController;
    private attachments: ContextAttachment[] = [];

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly chatRuntime: ReadOnlyChatRuntime,
        private readonly conversations: ConversationStore,
        private readonly contextCollector: WorkspaceContextCollector,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
        view.onDidDispose(() => this.activeRun?.abort());
    }

    private async handleMessage(message: WebviewMessage): Promise<void> {
        if (message.type === "ready") {
            await this.postConversation();
            await this.post({ type: "status", text: `Ready / ${this.chatRuntime.providerNames().join(" + ")}`, tone: "ready" });
            return;
        }

        if (message.type === "stop") {
            this.activeRun?.abort();
            return;
        }

        if (message.type === "attach") {
            try {
                this.attachments.push(await this.contextCollector.collect(message.kind));
                await this.post({ type: "attachments", attachments: this.attachments.map(({ id, label, kind }) => ({ id, label, kind })) });
            } catch (error) {
                await this.post({ type: "status", text: error instanceof Error ? error.message : "Context attachment failed." });
            }
            return;
        }

        if (message.type === "removeAttachment") {
            this.attachments = this.attachments.filter((attachment) => attachment.id !== message.id);
            await this.post({ type: "attachments", attachments: this.attachments.map(({ id, label, kind }) => ({ id, label, kind })) });
            return;
        }

        if (message.type === "newConversation") {
            this.activeRun?.abort();
            this.attachments = [];
            await this.conversations.create();
            await this.post({ type: "cleared" });
            await this.postConversation();
            return;
        }

        if (message.type === "selectConversation") {
            this.activeRun?.abort();
            this.attachments = [];
            if (await this.conversations.select(message.id)) {
                await this.post({ type: "cleared" });
                await this.postConversation();
            }
            return;
        }

        if (message.type === "regenerate") {
            const previous = this.conversations.load().at(-1);
            if (!previous) {
                await this.post({ type: "status", text: "There is no completed response to regenerate." });
                return;
            }
            this.attachments = [];
            await this.post({ type: "attachments", attachments: [] });
            await this.post({ type: "removeLast" });
            await this.runPrompt({ type: "send", ...previous }, true);
            return;
        }

        if (message.type !== "send" || !message.prompt.trim()) {
            return;
        }

        await this.runPrompt(message, false);
    }

    private async runPrompt(message: Extract<WebviewMessage, { type: "send" }>, replaceLast: boolean): Promise<void> {
        this.activeRun?.abort();
        const run = new AbortController();
        this.activeRun = run;

        await this.post({
            type: "runStart",
            prompt: message.prompt.trim(),
            meta: `${label(message.mode)} / ${message.harness} / ${message.model}`,
        });

        if (message.mode === "agent") {
            await this.streamAgentPlaceholder(message.harness, message.model, run);
            return;
        }

        let route = "No route selected";
        let response = "";
        try {
            for await (const event of this.chatRuntime.stream({
                runId: `${Date.now()}`,
                prompt: message.prompt.trim(),
                mode: message.mode,
                modelSelection: message.model,
                context: this.attachments,
            }, run.signal)) {
                if (event.type === "text-delta") {
                    response += event.text;
                    await this.post({ type: "delta", text: event.text });
                } else if (event.type === "route-attempt") {
                    route = `${event.providerId} / ${event.modelId}`;
                    await this.post({ type: "status", text: `Generating / ${route}` });
                } else if (event.type === "fallback") {
                    route = `${event.fromProviderId} / ${event.fromModelId} -> ${event.toProviderId} / ${event.toModelId} (${event.reason})`;
                }
            }
            const turn = {
                prompt: message.prompt.trim(),
                response,
                mode: message.mode,
                harness: message.harness,
                model: message.model,
                route,
            };
            if (replaceLast) {
                await this.conversations.replaceLast(turn);
            } else {
                await this.conversations.append(turn);
            }
            await this.post({ type: "conversations", conversations: this.conversations.list(), activeId: this.conversations.activeId() });
            this.attachments = [];
            await this.post({ type: "attachments", attachments: [] });
            await this.post({ type: "runDone", route });
        } catch (error) {
            const normalized = normalizeError(error);
            await this.post(normalized.code === "aborted"
                ? { type: "runStopped" }
                : { type: "runError", text: normalized.message, route });
        } finally {
            if (this.activeRun === run) {
                this.activeRun = undefined;
            }
        }
    }

    private async streamAgentPlaceholder(harness: string, model: ModelSelection, run: AbortController): Promise<void> {
        const response = `Agent mode is reserved for the ${harness} harness with ${modelLabel(model)} routing. It cannot modify files or run commands until the Phase 4 trust, approval, diff, and cancellation contracts are active.`;
        for (const token of response.split(/(\s+)/)) {
            if (run.signal.aborted) {
                await this.post({ type: "runStopped" });
                return;
            }
            await this.post({ type: "delta", text: token });
            await delay(22);
        }
        this.activeRun = undefined;
        await this.post({ type: "runDone", route: "Agent tools disabled / Phase 4" });
    }

    private post(message: unknown): Thenable<boolean> {
        return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
    }

    private async postConversation(): Promise<void> {
        await this.post({ type: "conversations", conversations: this.conversations.list(), activeId: this.conversations.activeId() });
        await this.post({ type: "restore", turns: this.conversations.load().map((turn) => ({
            prompt: turn.prompt,
            response: turn.response,
            meta: `${label(turn.mode)} / ${turn.harness} / ${modelLabel(turn.model)}`,
            route: turn.route,
        })) });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = createNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Nexus AI</title>
    <style>
        :root { color-scheme: light dark; }
        * { box-sizing: border-box; }
        body { margin: 0; min-width: 230px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
        button, textarea, select { font: inherit; }
        .shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
        .topbar { padding: 10px 12px; border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border)); background: var(--vscode-sideBar-background); }
        .conversation-bar { height: 28px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
        .conversation-bar select { min-width: 0; flex: 1; margin-right: 6px; }
        .conversation-actions { display: flex; gap: 3px; }
        .tool-button { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 16px; }
        .tool-button:hover { background: var(--vscode-toolbar-hoverBackground); }
        .mode { display: grid; grid-template-columns: repeat(3, 1fr); height: 30px; padding: 2px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
        .mode button { border: 0; border-radius: 3px; color: var(--vscode-descriptionForeground); background: transparent; cursor: pointer; }
        .mode button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
        .selectors { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        label { display: grid; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
        select { width: 100%; height: 28px; padding: 0 6px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; }
        .transcript { min-height: 0; overflow-y: auto; padding: 14px 12px 24px; }
        .empty { height: 100%; min-height: 220px; display: grid; place-content: center; gap: 7px; text-align: center; color: var(--vscode-descriptionForeground); }
        .mark { width: 36px; height: 36px; margin: 0 auto 4px; display: grid; place-items: center; border: 1px solid var(--vscode-focusBorder); color: var(--vscode-focusBorder); border-radius: 6px; font-size: 20px; }
        .empty strong { color: var(--vscode-foreground); font-weight: 600; }
        .message { margin-bottom: 18px; }
        .message header { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 7px; color: var(--vscode-descriptionForeground); font-size: 11px; }
        .message p { margin: 0; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
        .assistant { padding-left: 10px; border-left: 2px solid var(--vscode-focusBorder); }
        .route { margin-top: 9px; color: var(--vscode-descriptionForeground); font-size: 11px; }
        .composer { padding: 10px 12px 12px; border-top: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border)); background: var(--vscode-sideBar-background); }
        .input-wrap { border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); background: var(--vscode-input-background); border-radius: 4px; }
        .input-wrap:focus-within { border-color: var(--vscode-focusBorder); }
        textarea { width: 100%; min-height: 68px; max-height: 180px; resize: vertical; padding: 9px 10px; color: var(--vscode-input-foreground); background: transparent; border: 0; outline: 0; line-height: 1.45; }
        .actions { height: 36px; display: flex; align-items: center; justify-content: space-between; padding: 0 6px 6px 10px; }
        .context-tools { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .context-tools select { width: 110px; }
        .attach { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); cursor: pointer; }
        .attachments { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 8px 7px; }
        .attachment { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 3px 5px; border: 1px solid var(--vscode-widget-border); border-radius: 3px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-background); }
        .attachment span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .attachment button { padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; }
        .status { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .send { min-width: 30px; height: 28px; border: 0; border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
        .send:hover { background: var(--vscode-button-hoverBackground); }
        .send:disabled { opacity: .5; cursor: default; }
    </style>
</head>
<body>
    <main class="shell">
        <section class="topbar" aria-label="Conversation controls">
            <div class="conversation-bar"><select id="conversation" aria-label="Conversation"></select><div class="conversation-actions"><button id="regenerate" class="tool-button" title="Regenerate last response" aria-label="Regenerate last response">&#8635;</button><button id="newConversation" class="tool-button" title="New conversation" aria-label="New conversation">+</button></div></div>
            <div class="mode" role="group" aria-label="Chat mode">
                <button data-mode="ask" aria-pressed="true">Ask</button>
                <button data-mode="agent" aria-pressed="false">Agent</button>
                <button data-mode="design" aria-pressed="false">Design</button>
            </div>
            <div class="selectors">
                <label>Harness<select id="harness"><option value="OpenCode">OpenCode</option><option value="FreeCode" disabled>FreeCode (pending)</option><option value="Free Claude Code" disabled>Free Claude Code (pending)</option></select></label>
                <label>Provider<select id="model"><option value="auto">Auto / free-first</option><option value="ollama">Ollama / local</option><option value="openrouter">OpenRouter / free only</option><option value="groq">Groq / free tier</option></select></label>
            </div>
        </section>
        <section id="transcript" class="transcript" aria-live="polite">
            <div id="empty" class="empty"><div class="mark">N</div><strong>Nexus AI</strong><span>Local and free-tier coding routes.</span></div>
        </section>
        <section class="composer">
            <div class="input-wrap">
                <textarea id="prompt" aria-label="Message Nexus AI" placeholder="Ask about this workspace..." spellcheck="true"></textarea>
                <div id="attachments" class="attachments"></div>
                <div class="actions"><div class="context-tools"><select id="contextKind" aria-label="Context source"><option value="selection">Selection</option><option value="file">Active file</option><option value="symbols">Symbols</option><option value="diagnostics">Diagnostics</option><option value="terminal">Terminal selection</option><option value="git-diff">Git diff</option></select><button id="attach" class="attach" title="Attach context" aria-label="Attach context">+</button></div><span id="status" class="status">Starting...</span><button id="send" class="send" title="Send" aria-label="Send">&#8593;</button></div>
            </div>
        </section>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const transcript = document.getElementById('transcript');
        const prompt = document.getElementById('prompt');
        const send = document.getElementById('send');
        const status = document.getElementById('status');
        const harness = document.getElementById('harness');
        const model = document.getElementById('model');
        const contextKind = document.getElementById('contextKind');
        const attachments = document.getElementById('attachments');
        const conversation = document.getElementById('conversation');
        let mode = 'ask';
        let running = false;
        let responseNode;

        document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
            mode = button.dataset.mode;
            document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            prompt.placeholder = mode === 'agent' ? 'Describe a coding task...' : mode === 'design' ? 'Describe what you want to design...' : 'Ask about this workspace...';
        }));

        function submit() {
            if (running) {
                vscode.postMessage({ type: 'stop' });
                return;
            }
            if (!prompt.value.trim()) return;
            vscode.postMessage({ type: 'send', prompt: prompt.value, mode, harness: harness.value, model: model.value });
            prompt.value = '';
        }

        send.addEventListener('click', submit);
        document.getElementById('attach').addEventListener('click', () => vscode.postMessage({ type: 'attach', kind: contextKind.value }));
        document.getElementById('regenerate').addEventListener('click', () => { if (!running) vscode.postMessage({ type: 'regenerate' }); });
        document.getElementById('newConversation').addEventListener('click', () => vscode.postMessage({ type: 'newConversation' }));
        conversation.addEventListener('change', () => vscode.postMessage({ type: 'selectConversation', id: conversation.value }));
        attachments.addEventListener('click', event => {
            const id = event.target.dataset.remove;
            if (id) vscode.postMessage({ type: 'removeAttachment', id });
        });
        prompt.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'status') status.textContent = message.text;
            if (message.type === 'conversations') {
                conversation.textContent = '';
                message.conversations.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.title;
                    option.selected = item.id === message.activeId;
                    conversation.appendChild(option);
                });
            }
            if (message.type === 'attachments') {
                attachments.textContent = '';
                message.attachments.forEach(item => {
                    const chip = document.createElement('span');
                    chip.className = 'attachment';
                    const text = document.createElement('span');
                    text.textContent = item.label;
                    const remove = document.createElement('button');
                    remove.dataset.remove = item.id;
                    remove.title = 'Remove context';
                    remove.setAttribute('aria-label', 'Remove ' + item.label);
                    remove.textContent = '×';
                    chip.append(text, remove);
                    attachments.appendChild(chip);
                });
            }
            if (message.type === 'removeLast') {
                const messages = transcript.querySelectorAll('.message');
                messages[messages.length - 1]?.remove();
                messages[messages.length - 2]?.remove();
            }
            if (message.type === 'cleared') {
                transcript.innerHTML = '<div id="empty" class="empty"><div class="mark">N</div><strong>Nexus AI</strong><span>Local and free-tier coding routes.</span></div>';
                attachments.textContent = '';
                finish('Ready');
            }
            if (message.type === 'restore') {
                if (message.turns.length) document.getElementById('empty')?.remove();
                message.turns.forEach(turn => appendTurn(turn.prompt, turn.meta, turn.response, turn.route));
            }
            if (message.type === 'runStart') {
                document.getElementById('empty')?.remove();
                running = true;
                send.textContent = '■';
                send.title = 'Stop';
                status.textContent = 'Generating';
                responseNode = appendTurn(message.prompt, message.meta, '', '');
                transcript.scrollTop = transcript.scrollHeight;
            }
            if (message.type === 'delta' && responseNode) {
                responseNode.textContent += message.text;
                transcript.scrollTop = transcript.scrollHeight;
            }
            if (message.type === 'runDone') {
                const routes = transcript.querySelectorAll('.route');
                if (routes.length) routes[routes.length - 1].textContent = message.route;
                finish('Ready');
            }
            if (message.type === 'runError') {
                if (responseNode) responseNode.textContent = message.text;
                const routes = transcript.querySelectorAll('.route');
                if (routes.length) routes[routes.length - 1].textContent = message.route;
                finish('Error');
            }
            if (message.type === 'runStopped') finish('Stopped');
        });

        function appendTurn(promptText, meta, responseText, routeText) {
            transcript.insertAdjacentHTML('beforeend', '<article class="message user"><header><strong>You</strong><span></span></header><p></p></article><article class="message assistant"><header><strong>Nexus AI</strong><span></span></header><p></p><div class="route"></div></article>');
            const messages = transcript.querySelectorAll('.message');
            const user = messages[messages.length - 2];
            const assistant = messages[messages.length - 1];
            user.querySelector('p').textContent = promptText;
            user.querySelector('header span').textContent = meta;
            assistant.querySelector('p').textContent = responseText;
            assistant.querySelector('.route').textContent = routeText;
            return assistant.querySelector('p');
        }

        function finish(text) {
            running = false;
            send.textContent = '↑';
            send.title = 'Send';
            status.textContent = text;
            responseNode = undefined;
        }

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}

function label(mode: ChatMode): string {
    return mode === "ask" ? "Ask" : mode === "agent" ? "Agent" : "Design";
}

function modelLabel(model: ModelSelection): string {
    if (model === "ollama") return "Ollama / local";
    if (model === "openrouter") return "OpenRouter / free only";
    if (model === "groq") return "Groq / free tier";
    return "Auto / free-first";
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createNonce(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";
    for (let index = 0; index < 32; index += 1) {
        value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return value;
}