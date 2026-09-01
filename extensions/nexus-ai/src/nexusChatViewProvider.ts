import * as vscode from "vscode";
import { normalizeError } from "@nexus/ai-core";
import { ModelSelection, ReadOnlyChatRuntime } from "./readOnlyChatRuntime";

type ChatMode = "ask" | "agent" | "design";

type WebviewMessage =
    | { type: "ready" }
    | { type: "send"; prompt: string; mode: ChatMode; harness: string; model: ModelSelection }
    | { type: "stop" };

export class NexusChatViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private activeRun?: AbortController;

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly chatRuntime: ReadOnlyChatRuntime,
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
            await this.post({ type: "status", text: `Ready / ${this.chatRuntime.providerNames().join(" + ")}`, tone: "ready" });
            return;
        }

        if (message.type === "stop") {
            this.activeRun?.abort();
            return;
        }

        if (message.type !== "send" || !message.prompt.trim()) {
            return;
        }

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
        try {
            for await (const event of this.chatRuntime.stream({
                runId: `${Date.now()}`,
                prompt: message.prompt.trim(),
                mode: message.mode,
                modelSelection: message.model,
            }, run.signal)) {
                if (event.type === "text-delta") {
                    await this.post({ type: "delta", text: event.text });
                } else if (event.type === "route-attempt") {
                    route = `${event.providerId} / ${event.modelId}`;
                    await this.post({ type: "status", text: `Generating / ${route}` });
                } else if (event.type === "fallback") {
                    route = `${event.fromProviderId} / ${event.fromModelId} -> ${event.toProviderId} / ${event.toModelId} (${event.reason})`;
                }
            }
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
        .status { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .send { min-width: 30px; height: 28px; border: 0; border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
        .send:hover { background: var(--vscode-button-hoverBackground); }
        .send:disabled { opacity: .5; cursor: default; }
    </style>
</head>
<body>
    <main class="shell">
        <section class="topbar" aria-label="Conversation controls">
            <div class="mode" role="group" aria-label="Chat mode">
                <button data-mode="ask" aria-pressed="true">Ask</button>
                <button data-mode="agent" aria-pressed="false">Agent</button>
                <button data-mode="design" aria-pressed="false">Design</button>
            </div>
            <div class="selectors">
                <label>Harness<select id="harness"><option value="OpenCode">OpenCode</option><option value="FreeCode" disabled>FreeCode (pending)</option><option value="Free Claude Code" disabled>Free Claude Code (pending)</option></select></label>
                <label>Model<select id="model"><option value="auto">Auto / free-first</option><option value="ollama">Ollama / local</option></select></label>
            </div>
        </section>
        <section id="transcript" class="transcript" aria-live="polite">
            <div id="empty" class="empty"><div class="mark">N</div><strong>Nexus AI</strong><span>Local and free-tier coding routes.</span></div>
        </section>
        <section class="composer">
            <div class="input-wrap">
                <textarea id="prompt" aria-label="Message Nexus AI" placeholder="Ask about this workspace..." spellcheck="true"></textarea>
                <div class="actions"><span id="status" class="status">Starting...</span><button id="send" class="send" title="Send" aria-label="Send">&#8593;</button></div>
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
        prompt.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'status') status.textContent = message.text;
            if (message.type === 'runStart') {
                document.getElementById('empty')?.remove();
                running = true;
                send.textContent = '■';
                send.title = 'Stop';
                status.textContent = 'Generating';
                transcript.insertAdjacentHTML('beforeend', '<article class="message user"><header><strong>You</strong><span></span></header><p></p></article><article class="message assistant"><header><strong>Nexus AI</strong><span></span></header><p></p><div class="route"></div></article>');
                const messages = transcript.querySelectorAll('.message');
                const user = messages[messages.length - 2];
                const assistant = messages[messages.length - 1];
                user.querySelector('p').textContent = message.prompt;
                user.querySelector('header span').textContent = message.meta;
                responseNode = assistant.querySelector('p');
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
    return model === "ollama" ? "Ollama / local" : "Auto / free-first";
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