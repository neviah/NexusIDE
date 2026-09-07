import * as vscode from "vscode";
import { McpServerManager } from "./mcpServerManager";
import { ProviderStateStore } from "./providerStateStore";
import { RouteStackStore } from "./routeStackStore";

type StatusMessage = { type: "ready" | "refresh" };

export interface AgentStatusViewModel {
    profile: string;
    workspaceTrusted: boolean;
    stackCount: number;
    primaryRoute?: string;
    mcpServers: readonly { label: string; status: string; trusted: boolean }[];
    checkpoints: readonly { createdAt: string; files: number }[];
    smoke: readonly { provider: string; outcome: string; message: string; checkedAt: string }[];
}

export class AgentStatusViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly routeStack: RouteStackStore,
        private readonly providerState: ProviderStateStore,
        private readonly mcpManager: McpServerManager,
        private readonly checkpoints: () => readonly { createdAt: string; files: readonly unknown[] }[],
        private readonly profile: () => string,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.onDidReceiveMessage((message: StatusMessage) => void this.refresh());
        view.webview.html = this.getHtml(view.webview);
    }

    public async refresh(): Promise<void> {
        const model = await this.collect();
        await this.view?.webview.postMessage({ type: "status", model });
    }

    private async collect(): Promise<AgentStatusViewModel> {
        const routes = this.routeStack.load();
        return {
            profile: this.profile(),
            workspaceTrusted: vscode.workspace.isTrusted,
            stackCount: routes.length,
            primaryRoute: routes[0],
            mcpServers: (await this.mcpManager.status()).map((server) => ({ label: server.label, status: server.status, trusted: server.trust === "trusted" })),
            checkpoints: this.checkpoints().map((checkpoint) => ({ createdAt: checkpoint.createdAt, files: checkpoint.files.length })),
            smoke: [],
        };
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = Array.from({ length: 32 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><style>body{margin:0;padding:12px;color:var(--vscode-foreground);font:var(--vscode-font-size) var(--vscode-font-family);background:var(--vscode-sideBar-background)}button{padding:4px 8px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:3px}.section{margin-bottom:12px;padding:9px;border:1px solid var(--vscode-widget-border);border-radius:4px}.meta{color:var(--vscode-descriptionForeground);font-size:11px}.ok{color:var(--vscode-charts-green,var(--vscode-foreground))}.warn{color:var(--vscode-editorWarning-foreground)}</style></head><body><div class="section"><strong>Agent Status</strong><div class="meta" id="summary">Loading...</div></div><div class="section"><strong>MCP Servers</strong><div id="mcp" class="meta"></div></div><div class="section"><strong>Recovery</strong><div id="checkpoints" class="meta"></div></div><script nonce="${nonce}">const vscode=acquireVsCodeApi();window.addEventListener('message',e=>{const m=e.data.model;document.getElementById('summary').textContent=m.profile+' · '+(m.workspaceTrusted?'trusted workspace':'restricted')+' · '+m.stackCount+' route(s)'+(m.primaryRoute?' · '+m.primaryRoute:'');document.getElementById('mcp').textContent=m.mcpServers.map(s=>s.label+': '+s.status).join(' | ')||'None configured';document.getElementById('checkpoints').textContent=m.checkpoints.map(c=>c.files+' file(s)').join(' | ')||'No checkpoints';});vscode.postMessage({type:'ready'});</script></body></html>`;
    }
}
