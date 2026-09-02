import * as vscode from "vscode";
import { McpServerManager } from "./mcpServerManager";

type McpMessage =
    | { type: "ready" | "refresh" }
    | { type: "trust" | "revoke" | "connect" | "disconnect" | "setToken" | "deleteToken"; id: string }
    | { type: "addServer" }
    | { type: "openSettings" };

export interface McpViewActions {
    setToken(id: string): Promise<void>;
    deleteToken(id: string): Promise<void>;
    addServer(): Promise<void>;
}

export class McpViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly manager: McpServerManager,
        private readonly actions: McpViewActions,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.onDidReceiveMessage((message: McpMessage) => this.handleMessage(message));
        view.webview.html = this.getHtml(view.webview);
    }

    public async refresh(): Promise<void> {
        await this.post({ type: "servers", servers: await this.manager.status(), workspaceTrusted: vscode.workspace.isTrusted });
    }

    private async handleMessage(message: McpMessage): Promise<void> {
        if (message.type === "ready" || message.type === "refresh") {
            await this.refresh();
            return;
        }
        if (message.type === "addServer") {
            await this.actions.addServer();
            await this.refresh();
            return;
        }
        if (message.type === "openSettings") {
            await vscode.commands.executeCommand("workbench.action.openSettings", "nexusAI.mcp");
            return;
        }
        if (message.type === "trust") {
            if (await this.manager.requestTrust(message.id)) {
                await this.manager.connect(message.id);
            }
        }
        if (message.type === "revoke") {
            await this.manager.revokeTrust(message.id);
        }
        if (message.type === "connect") {
            await this.manager.connect(message.id);
        }
        if (message.type === "disconnect") {
            await this.manager.disconnect(message.id);
        }
        if (message.type === "setToken") {
            await this.actions.setToken(message.id);
        }
        if (message.type === "deleteToken") {
            await this.actions.deleteToken(message.id);
        }
        await this.refresh();
    }

    private post(message: unknown): Thenable<boolean> {
        return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = createNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "mcp.js"));
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 10px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    button { font: inherit; padding: 3px 9px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; }
    .server { margin-bottom: 10px; padding: 9px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
    .server.untrusted { border-left: 3px solid var(--vscode-editorWarning-foreground); }
    .server.trusted { border-left: 3px solid var(--vscode-charts-green, var(--vscode-focusBorder)); }
    .name { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-weight: 600; }
    .badge { padding: 1px 6px; border-radius: 9px; font-size: 10px; font-weight: 400; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
    .risk { margin-top: 5px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .detail { margin-top: 2px; font-family: var(--vscode-editor-font-family); font-size: 11px; word-break: break-all; }
    .status { margin-top: 5px; font-size: 11px; }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
    .tools { margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--vscode-widget-border); font-size: 11px; }
    .tool { padding: 1px 0; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
    .empty { color: var(--vscode-descriptionForeground); font-size: 12px; }
</style>
</head>
<body>
<div class="toolbar">
    <button id="add">Add Server</button>
    <button id="settings" class="secondary">Settings</button>
    <button id="refresh" class="secondary">Refresh</button>
</div>
<div id="notice" class="empty" role="status" aria-live="polite"></div>
<section id="servers" aria-label="MCP servers"></section>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function createNonce(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
