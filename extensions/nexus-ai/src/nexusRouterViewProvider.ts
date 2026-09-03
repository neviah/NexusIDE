import { normalizeError, ProviderRegistry, SecretStore } from "@nexus/ai-core";
import * as vscode from "vscode";
import { ProviderStateStore } from "./providerStateStore";
import { RouteStackStore } from "./routeStackStore";
import { PROVIDER_CATALOG, providerCatalogEntry } from "./providerCatalog";

type RouterMessage =
    | { type: "ready" | "refresh" }
    | { type: "setCredential" | "deleteCredential"; providerId: string }
    | { type: "setEnabled"; providerId: string; enabled: boolean }
    | { type: "setQuotaNote"; providerId: string; note: string }
    | { type: "openKeyUrl"; providerId: string }
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
        private readonly providerState: ProviderStateStore,
        private readonly credentials: Readonly<Record<string, CredentialAction>>,
    ) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        view.webview.onDidReceiveMessage((message: RouterMessage) => this.handleMessage(message));
        view.webview.html = this.getHtml(view.webview);
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
        if (message.type === "setEnabled") {
            await this.providerState.configure(message.providerId, message.enabled, this.providerState.provider(message.providerId).quotaNote);
            await this.refresh();
            return;
        }
        if (message.type === "setQuotaNote") {
            const settings = this.providerState.provider(message.providerId);
            await this.providerState.configure(message.providerId, settings.enabled, message.note);
            await this.refresh();
            return;
        }
        if (message.type === "saveStack") {
            const savedRoutes = new Set(this.routeStack.load());
            await this.routeStack.save(message.routes.filter((route) => this.availableRoutes.has(route) || savedRoutes.has(route)));
            await this.post({ type: "saved" });
            await this.refresh();
            return;
        }
        if (message.type === "openKeyUrl") {
            const url = providerCatalogEntry(message.providerId)?.keyUrl;
            if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    public async refresh(): Promise<void> {
        await this.post({ type: "loading" });
        const providers = [];
        this.availableRoutes.clear();
        for (const adapter of this.providers.list()) {
            const manifest = adapter.manifest();
            const settings = this.providerState.provider(manifest.id);
            if (!settings.enabled) {
                providers.push({ id: manifest.id, name: manifest.displayName, enabled: false, status: "Disabled", quotaNote: settings.quotaNote, smoke: settings.smoke, models: [], configurable: Boolean(this.credentials[manifest.id]) });
                continue;
            }
            const authentication = await adapter.authenticate(this.secretStore);
            if (!authentication.authenticated) {
                providers.push({ id: manifest.id, name: manifest.displayName, enabled: true, status: "Not configured", quotaNote: settings.quotaNote, smoke: settings.smoke, models: [], configurable: Boolean(this.credentials[manifest.id]) });
                continue;
            }
            try {
                const health = await adapter.health(AbortSignal.timeout(10_000));
                await this.providerState.recordHealth(manifest.id, health);
                const models = await adapter.listModels(AbortSignal.timeout(10_000));
                const entries = models.map((model) => {
                    const route = `${manifest.id}/${model.id}`;
                    this.availableRoutes.add(route);
                    const runtime = this.providerState.route(manifest.id, model.id);
                    return { route, id: model.id, name: model.displayName ?? model.id, cost: model.costClass, context: model.contextTokens, quota: runtime.quota, cooldownUntil: runtime.cooldownUntil };
                });
                providers.push({ id: manifest.id, name: manifest.displayName, enabled: true, status: entries.length ? "Ready" : "No eligible models", health, quotaNote: settings.quotaNote, smoke: settings.smoke, models: entries, configurable: Boolean(this.credentials[manifest.id]) });
            } catch (error) {
                providers.push({ id: manifest.id, name: manifest.displayName, enabled: true, status: normalizeError(error, manifest.id).message, health: this.providerState.provider(manifest.id).health, quotaNote: settings.quotaNote, smoke: settings.smoke, models: [], configurable: Boolean(this.credentials[manifest.id]) });
            }
        }
        const stack = this.routeStack.load();
        const integratedIds = new Set(providers.map(({ id }) => id));
        const catalog = PROVIDER_CATALOG.map((entry) => integratedIds.has(entry.id)
            ? entry
            : { ...entry, status: "Adapter not yet integrated", models: [], enabled: false, configurable: false });
        await this.post({ type: "catalog", providers, catalog, stack });
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
header{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border-top:2px solid var(--vscode-focusBorder);border-bottom:1px solid var(--vscode-sideBar-border,var(--vscode-widget-border));background:var(--vscode-sideBarSectionHeader-background)}h2{margin:1px 0 0;font-size:13px}.eyebrow{color:var(--vscode-descriptionForeground);font-size:9px;text-transform:uppercase;letter-spacing:0}button{border:0;border-radius:3px;padding:5px 8px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.icon{width:28px;height:26px;padding:0;font-size:16px}.content{padding:12px}.provider-select{display:grid;gap:5px;margin-bottom:12px;color:var(--vscode-descriptionForeground);font-size:11px}.provider-select select{width:100%;height:30px;padding:0 7px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border)}.status,.meta{color:var(--vscode-descriptionForeground);font-size:11px}.provider{padding:12px 0;border-top:1px solid var(--vscode-widget-border)}.provider-head{display:flex;align-items:start;justify-content:space-between;gap:8px}.provider-title{display:flex;align-items:center;gap:7px}.provider h3{margin:0;font-size:12px}.credential{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.models{display:grid;gap:4px;margin-top:11px}.model{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:start;padding:6px 0}.model-copy{overflow-wrap:anywhere}.route-tools{display:flex;align-items:center;gap:2px}.order{width:18px;text-align:center;color:var(--vscode-descriptionForeground);font-size:11px}.route-tools button{width:24px;height:22px;padding:0}.quota-note{width:100%;margin-top:9px;padding:5px 7px;border:1px solid var(--vscode-input-border,var(--vscode-widget-border));color:var(--vscode-input-foreground);background:var(--vscode-input-background)}.footer{position:sticky;bottom:0;padding:10px 12px;border-top:1px solid var(--vscode-sideBar-border,var(--vscode-widget-border));background:var(--vscode-sideBar-background)}.footer button{width:100%;height:30px}
</style></head><body><header><div><div class="eyebrow">Routing control</div><h2>Provider Catalog</h2></div><button id="refresh" class="icon" title="Refresh providers" aria-label="Refresh providers">&#8635;</button></header><main class="content"><label class="provider-select">Provider<select id="provider" aria-label="Provider"></select></label><div id="content"><span class="status">Loading providers...</span></div></main><div class="footer"><button id="save">Save Auto Stack</button></div>
<script nonce="${nonce}">const vscode=acquireVsCodeApi(),content=document.getElementById('content'),providerSelect=document.getElementById('provider');let routes=[],providerData=[],catalog=[];
const selectedRoutes=()=>[...routes];const updateOrders=()=>{document.querySelectorAll('.model').forEach(row=>{const index=routes.indexOf(row.querySelector('[data-route]').dataset.route);row.querySelector('.order').textContent=index<0?'':String(index+1)})};document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('save').onclick=()=>vscode.postMessage({type:'saveStack',routes:selectedRoutes()});
providerSelect.onchange=renderProvider;
content.addEventListener('change',event=>{if(event.target.dataset.route){const route=event.target.dataset.route;if(event.target.checked&&!routes.includes(route))routes.push(route);if(!event.target.checked)routes=routes.filter(item=>item!==route);updateOrders();return}if(event.target.dataset.enable)vscode.postMessage({type:'setEnabled',providerId:event.target.dataset.enable,enabled:event.target.checked});if(event.target.dataset.note)vscode.postMessage({type:'setQuotaNote',providerId:event.target.dataset.note,note:event.target.value})});
content.addEventListener('click',event=>{const action=event.target.dataset.action,providerId=event.target.dataset.provider;if(action&&providerId){vscode.postMessage({type:action,providerId});return}const direction=Number(event.target.dataset.move);if(!direction)return;const checkbox=event.target.closest('.model').querySelector('[data-route]');if(!checkbox.checked)checkbox.checked=true;routes=selectedRoutes();const index=routes.indexOf(checkbox.dataset.route),target=index+direction;if(target>=0&&target<routes.length)[routes[index],routes[target]]=[routes[target],routes[index]];updateOrders()});
function renderProvider(){const entry=catalog.find(item=>item.id===providerSelect.value),provider=providerData.find(item=>item.id===providerSelect.value);content.textContent='';if(!entry)return;const section=document.createElement('section');section.className='provider';section.innerHTML='<div class="provider-head"><div><div class="provider-title"><input class="enabled" type="checkbox"><h3></h3></div><div class="status"></div><div class="meta requirement"></div><div class="meta health"></div></div></div><div class="credential"></div><input class="quota-note" type="text" placeholder="Quota note (optional)" aria-label="Quota note"><div class="models"></div>';section.querySelector('h3').textContent=entry.name;section.querySelector('.requirement').textContent=entry.requirement;const enabled=section.querySelector('.enabled');enabled.checked=provider?.enabled??false;enabled.disabled=!entry.integrated;enabled.dataset.enable=entry.id;section.querySelector('.status').textContent=provider?.status??'Adapter not yet integrated';const health=section.querySelector('.health');if(provider?.health)health.textContent='Health: '+provider.health.status+(provider.health.latencyMs!==undefined?' · '+provider.health.latencyMs+' ms':'')+' · checked '+new Date(provider.health.checkedAt).toLocaleTimeString();const note=section.querySelector('.quota-note');note.dataset.note=entry.id;note.value=provider?.quotaNote||'';note.disabled=!entry.integrated;const credential=section.querySelector('.credential');if(entry.keyUrl){const keyLink=document.createElement('button');keyLink.dataset.action='openKeyUrl';keyLink.dataset.provider=entry.id;keyLink.textContent='Get API key ↗';credential.appendChild(keyLink)}if(provider?.configurable){[['setCredential',entry.id==='custom-openai'?'Configure endpoint':'Enter API key'],['deleteCredential','Delete key']].forEach(([action,text])=>{const button=document.createElement('button');button.dataset.action=action;button.dataset.provider=entry.id;button.textContent=text;credential.appendChild(button)})}const models=section.querySelector('.models');[...(provider?.models??[])].sort((a,b)=>{const ai=routes.indexOf(a.route),bi=routes.indexOf(b.route);return (ai<0?Number.MAX_SAFE_INTEGER:ai)-(bi<0?Number.MAX_SAFE_INTEGER:bi)}).forEach(model=>{const label=document.createElement('label'),checkbox=document.createElement('input'),copy=document.createElement('span'),tools=document.createElement('span'),order=document.createElement('span');label.className='model';checkbox.type='checkbox';checkbox.dataset.route=model.route;checkbox.checked=routes.includes(model.route);copy.className='model-copy';copy.textContent=model.name+' · '+model.cost+(model.context?' · '+model.context.toLocaleString()+' ctx':'');const detail=document.createElement('small');detail.className='meta';detail.textContent=model.quota?'Quota: '+model.quota.status:'Quota: unknown';copy.append(document.createElement('br'),detail);tools.className='route-tools';order.className='order';tools.appendChild(order);[['-1','↑','Move route up'],['1','↓','Move route down']].forEach(([move,text,title])=>{const button=document.createElement('button');button.type='button';button.dataset.move=move;button.textContent=text;button.title=title;tools.appendChild(button)});label.append(checkbox,copy,tools);models.appendChild(label)});content.appendChild(section);updateOrders()}
window.addEventListener('message',event=>{const message=event.data;if(message.type==='loading')content.innerHTML='<span class="status">Checking providers...</span>';if(message.type==='saved')document.getElementById('save').textContent='Saved';if(message.type==='catalog'){routes=message.stack;providerData=message.providers;catalog=message.catalog;const selected=providerSelect.value;providerSelect.textContent='';catalog.forEach(entry=>{const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name+(entry.integrated?'':' · coming next');providerSelect.appendChild(option)});if(catalog.some(entry=>entry.id===selected))providerSelect.value=selected;renderProvider();document.getElementById('save').textContent='Save Auto Stack'}});vscode.postMessage({type:'ready'});
</script></body></html>`;
    }
}

function createNonce(): string {
    return Array.from({ length: 32 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
}