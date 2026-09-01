import { ProviderRegistry } from "@nexus/ai-core";
import * as vscode from "vscode";
import { ProviderStateStore } from "./providerStateStore";
import { RouteStackStore } from "./routeStackStore";

type StackMessage = { type: "ready" | "refresh" } | { type: "remove" | "move"; route: string; direction?: number };

export class RouteStackViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private view?: vscode.WebviewView;
    private readonly stackSubscription: { dispose(): void };

    public constructor(
        private readonly providers: ProviderRegistry,
        private readonly routeStack: RouteStackStore,
        private readonly providerState: ProviderStateStore,
    ) {
        this.stackSubscription = routeStack.onDidChange(() => void this.refresh());
    }

    public dispose(): void {
        this.stackSubscription.dispose();
    }

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((message: StackMessage) => void this.handle(message));
        view.webview.html = this.html(view.webview);
    }

    private async handle(message: StackMessage): Promise<void> {
        if (message.type === "ready" || message.type === "refresh") {
            await this.refresh();
            return;
        }
        if (!("route" in message)) return;
        const routes = [...this.routeStack.load()];
        const index = routes.indexOf(message.route);
        if (index < 0) return;
        if (message.type === "remove") routes.splice(index, 1);
        if (message.type === "move") {
            const target = index + Math.sign(message.direction ?? 0);
            if (target < 0 || target >= routes.length) return;
            [routes[index], routes[target]] = [routes[target], routes[index]];
        }
        await this.routeStack.save(routes);
    }

    private async refresh(): Promise<void> {
        const routes = this.routeStack.load();
        const providerNames = new Map(this.providers.list().map((adapter) => {
            const manifest = adapter.manifest();
            return [manifest.id, manifest.displayName] as const;
        }));
        const entries = routes.map((route, index) => {
            const separator = route.indexOf("/");
            const providerId = separator < 0 ? route : route.slice(0, separator);
            const modelId = separator < 0 ? route : route.slice(separator + 1);
            const provider = this.providerState.provider(providerId);
            const runtime = this.providerState.route(providerId, modelId);
            const quota = runtime.quota;
            return {
                route,
                order: index + 1,
                provider: providerNames.get(providerId) ?? providerId,
                model: modelId,
                health: provider.health?.status ?? "unknown",
                checkedAt: provider.health?.checkedAt,
                cooldownUntil: runtime.cooldownUntil,
                quota: quota ? {
                    status: quota.status,
                    remaining: quota.remaining,
                    limit: quota.limit,
                    used: quota.limit !== undefined && quota.remaining !== undefined ? Math.max(0, quota.limit - quota.remaining) : undefined,
                    resetsAt: quota.resetsAt,
                } : undefined,
            };
        });
        await this.view?.webview.postMessage({ type: "stack", entries });
    }

    private html(webview: vscode.Webview): string {
        const nonce = Math.random().toString(36).slice(2);
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src ${webview.cspSource} 'unsafe-inline';script-src 'nonce-${nonce}';"><title>Auto Stack</title><style>
*{box-sizing:border-box}body{margin:0;padding:10px 12px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}.summary{color:var(--vscode-descriptionForeground);font-size:11px}.icon{width:26px;height:24px;border:0;border-radius:3px;color:var(--vscode-foreground);background:transparent;cursor:pointer}.icon:hover{background:var(--vscode-toolbar-hoverBackground)}.route{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;padding:10px 0;border-bottom:1px solid var(--vscode-widget-border)}.order{width:22px;height:22px;display:grid;place-items:center;border-radius:3px;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background);font-size:11px}.name{font-weight:600;overflow-wrap:anywhere}.provider,.metrics{margin-top:3px;color:var(--vscode-descriptionForeground);font-size:11px}.health{display:inline-block;margin-right:6px}.health.healthy{color:var(--vscode-testing-iconPassed)}.health.degraded,.health.unavailable{color:var(--vscode-testing-iconFailed)}.tools{display:flex;gap:2px}.tools button{width:22px;height:22px;padding:0;border:0;border-radius:3px;color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground);cursor:pointer}.empty{padding:18px 4px;color:var(--vscode-descriptionForeground);text-align:center;line-height:1.5}
</style></head><body><header><span id="summary" class="summary">Loading stack...</span><button id="refresh" class="icon" title="Refresh stack" aria-label="Refresh stack">&#8635;</button></header><main id="stack"></main><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),stack=document.getElementById('stack'),summary=document.getElementById('summary');document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});stack.addEventListener('click',event=>{const route=event.target.dataset.route,action=event.target.dataset.action;if(!route||!action)return;vscode.postMessage({type:action,route,direction:Number(event.target.dataset.direction||0)})});window.addEventListener('message',event=>{const message=event.data;if(message.type!=='stack')return;summary.textContent=message.entries.length+' model'+(message.entries.length===1?'':'s')+' in fallback order';stack.textContent='';if(!message.entries.length){stack.innerHTML='<div class="empty">No models selected.<br>Add models in Providers and Models.</div>';return}message.entries.forEach(entry=>{const row=document.createElement('article');row.className='route';row.innerHTML='<span class="order"></span><div><div class="name"></div><div class="provider"></div><div class="metrics"><span class="health"></span><span class="usage"></span></div></div><div class="tools"><button data-action="move" data-direction="-1" title="Move up" aria-label="Move up">↑</button><button data-action="move" data-direction="1" title="Move down" aria-label="Move down">↓</button><button data-action="remove" title="Remove" aria-label="Remove">×</button></div>';row.querySelector('.order').textContent=entry.order;row.querySelector('.name').textContent=entry.model;row.querySelector('.provider').textContent=entry.provider;const health=row.querySelector('.health');health.textContent=entry.health;health.classList.add(entry.health);const usage=row.querySelector('.usage');usage.textContent=entry.quota?(entry.quota.used!==undefined?'Used '+entry.quota.used+' of '+entry.quota.limit+' requests':'Quota '+entry.quota.status):'Usage not reported';if(entry.cooldownUntil)usage.textContent+=' · cooling down';row.querySelectorAll('button').forEach(button=>button.dataset.route=entry.route);stack.appendChild(row)})});vscode.postMessage({type:'ready'});
</script></body></html>`;
    }
}