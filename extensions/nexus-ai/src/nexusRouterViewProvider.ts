import { normalizeError, ProviderRegistry, SecretStore } from "@nexus/ai-core";
import * as vscode from "vscode";
import { RouteStackStore } from "./routeStackStore";

type RouterMessage =
    | { type: "ready" | "refresh" }
    | { type: "setCredential" | "deleteCredential"; providerId: string }
    | { type: "saveStack"; routes: string[] };

interface CredentialAction {
    secretKey: string;
    set(): Promise<void>;
}

export class NexusRouterViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private availableRoutes = new Set<string>();

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly providers: ProviderRegistry,
        private readonly secretStore: SecretStore,
        private readonly routeStack: RouteStackStore,
        private readonly credentials: Readonly<Record<string, CredentialAction>>,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage((message: RouterMessage) => this.handleMessage(message));
    }

    private async handleMessage(message: RouterMessage): Promise<void> {
        if (message.type === "ready" || message.type === "refresh") {
            await this.refresh();
            return;
        }
        const credential = "providerId" in message ? this.credentials[message.providerId] : undefined;
        if (message.type === "setCredential" && credential) {
            await credential.set();
            await this.refresh();
            return;
        }
        if (message.type === "deleteCredential" && credential) {
            await this.secretStore.delete(credential.secretKey);
            await this.refresh();
            return;
        }
        if (message.type === "saveStack") {
            await this.routeStack.save(message.routes.filter((route) => this.availableRoutes.has(route)));
            await this.post({ type: "saved" });
        }
    }

    private async refresh(): Promise<void> {
        await this.post({ type: "loading" });
        const providers = [];
        this.availableRoutes.clear();
        for (const adapter of this.providers.list()) {
            const manifest = adapter.manifest();
            const authentication = await adapter.authenticate(this.secretStore);
            if (!authentication.authenticated) {
                providers.push({ id: manifest.id, name: manifest.displayName, status: "Not configured", models: [], configurable: Boolean(this.credentials[manifest.id]) });
                continue;
            }
            try {
                const models = await adapter.listModels(new AbortController().signal);
                const entries = models.map((model) => {
                    const route = `${manifest.id}/${model.id}`;
                    this.availableRoutes.add(route);
                    return { route, id: model.id, name: model.displayName ?? model.id, cost: model.costClass, context: model.contextTokens };
                });
                providers.push({ id: manifest.id, name: manifest.displayName, status: entries.length ? "Ready" : "No eligible models", models: entries, configurable: Boolean(this.credentials[manifest.id]) });
            } catch (error) {
                providers.push({ id: manifest.id, name: manifest.displayName, status: normalizeError(error, manifest.id).message, models: [], configurable: Boolean(this.credentials[manifest.id]) });
            }
        }
        const stack = this.routeStack.load().filter((route) => this.availableRoutes.has(route));
        await this.post({ type: "catalog", providers, stack });
    }

    private post(message: unknown): Thenable<boolean> {
        return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = createNonce();
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Nexus Router</title><style>
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:var(--vscode-font-size) var(--vscode-font-family)}
header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--vscode-sideBar-border,var(--vscode-widget-border))}h2{margin:0;font-size:13px}button{border:0;border-radius:3px;padding:5px 8px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.icon{min-width:28px;font-size:16px}.content{padding:10px 12px}.hint,.status,.model small{color:var(--vscode-descriptionForeground);font-size:11px}.provider{padding:10px 0;border-bottom:1px solid var(--vscode-widget-border)}.provider-head{display:flex;align-items:start;justify-content:space-between;gap:8px}.provider h3{margin:0 0 3px;font-size:12px}.credential{display:flex;gap:5px}.models{display:grid;gap:5px;margin-top:8px}.model{display:grid;grid-template-columns:auto 1fr;gap:7px;align-items:start}.model span{overflow-wrap:anywhere}.footer{position:sticky;bottom:0;padding:10px 12px;border-top:1px solid var(--vscode-sideBar-border,var(--vscode-widget-border));background:var(--vscode-sideBar-background)}.footer button{width:100%}
</style></head><body><header><h2>Nexus Router</h2><button id="refresh" class="icon" title="Refresh providers" aria-label="Refresh providers">&#8635;</button></header><main id="content" class="content"><span class="status">Loading providers...</span></main><div class="footer"><button id="save">Save Auto Stack</button></div>
<script nonce="${nonce}">const vscode=acquireVsCodeApi(),content=document.getElementById('content');let routes=[];
document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('save').onclick=()=>vscode.postMessage({type:'saveStack',routes:[...document.querySelectorAll('[data-route]:checked')].map(item=>item.dataset.route)});
content.addEventListener('click',event=>{const action=event.target.dataset.action,providerId=event.target.dataset.provider;if(action&&providerId)vscode.postMessage({type:action,providerId})});
window.addEventListener('message',event=>{const message=event.data;if(message.type==='loading')content.innerHTML='<span class="status">Checking providers...</span>';if(message.type==='saved')document.getElementById('save').textContent='Saved';if(message.type==='catalog'){routes=message.stack;content.innerHTML='';message.providers.forEach(provider=>{const section=document.createElement('section');section.className='provider';section.innerHTML='<div class="provider-head"><div><h3></h3><div class="status"></div></div><div class="credential"></div></div><div class="models"></div>';section.querySelector('h3').textContent=provider.name;section.querySelector('.status').textContent=provider.status;const credential=section.querySelector('.credential');if(provider.configurable){[['setCredential','Set key'],['deleteCredential','Delete']].forEach(([action,text])=>{const button=document.createElement('button');button.dataset.action=action;button.dataset.provider=provider.id;button.textContent=text;credential.appendChild(button)})}const models=section.querySelector('.models');provider.models.forEach(model=>{const label=document.createElement('label'),checkbox=document.createElement('input'),text=document.createElement('span');label.className='model';checkbox.type='checkbox';checkbox.dataset.route=model.route;checkbox.checked=routes.includes(model.route);text.textContent=model.name+' · '+model.cost+(model.context?' · '+model.context.toLocaleString()+' ctx':'');label.append(checkbox,text);models.appendChild(label)});content.appendChild(section)});document.getElementById('save').textContent='Save Auto Stack'}});vscode.postMessage({type:'ready'});
</script></body></html>`;
    }
}

function createNonce(): string {
    return Array.from({ length: 32 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
}