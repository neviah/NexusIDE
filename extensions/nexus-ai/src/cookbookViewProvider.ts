import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { COOKBOOK_MODELS, cookbookModel, inspectHardware, recommendedModels } from "./modelCookbook";

type CookbookMessage = { type: "ready" | "refresh" } | { type: "pull" | "openModel"; modelId: string };

export class CookbookViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private pulling?: string;

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((message: CookbookMessage) => void this.handle(message));
        view.webview.html = this.html(view.webview);
    }

    private async handle(message: CookbookMessage): Promise<void> {
        if (message.type === "ready" || message.type === "refresh") {
            await this.refresh();
            return;
        }
        if (!("modelId" in message)) return;
        const model = cookbookModel(message.modelId);
        if (!model) return;
        if (message.type === "openModel") {
            await vscode.env.openExternal(vscode.Uri.parse(model.modelUrl));
            return;
        }
        if (this.pulling) {
            await vscode.window.showWarningMessage(`Ollama is already pulling ${this.pulling}.`);
            return;
        }
        this.pulling = model.id;
        const output = vscode.window.createOutputChannel("NexusIDE Cookbook");
        output.show(true);
        output.appendLine(`ollama pull ${model.id}`);
        await this.post({ type: "pullStart", modelId: model.id });
        const child = spawn("ollama", ["pull", model.id], { windowsHide: true, shell: false });
        child.stdout.on("data", (data: Buffer) => output.append(data.toString("utf8")));
        child.stderr.on("data", (data: Buffer) => output.append(data.toString("utf8")));
        child.once("error", async (error) => {
            this.pulling = undefined;
            output.appendLine(`\n${error.message}`);
            await this.post({ type: "pullDone", modelId: model.id, ok: false });
            await vscode.window.showErrorMessage("Could not start Ollama. Install Ollama or make sure it is available on PATH.");
        });
        child.once("exit", async (code) => {
            if (this.pulling !== model.id) return;
            this.pulling = undefined;
            const ok = code === 0;
            await this.post({ type: "pullDone", modelId: model.id, ok });
            await (ok ? vscode.window.showInformationMessage(`${model.name} is ready in Ollama.`) : vscode.window.showErrorMessage(`Ollama pull failed with exit code ${code}. See NexusIDE Cookbook output.`));
        });
    }

    private async refresh(): Promise<void> {
        await this.post({ type: "loading" });
        const hardware = await inspectHardware();
        const recommended = new Set(recommendedModels(hardware).map(({ id }) => id));
        await this.post({ type: "catalog", hardware, models: COOKBOOK_MODELS.map((model) => ({ ...model, recommended: recommended.has(model.id) })) });
    }

    private post(message: unknown): Thenable<boolean> {
        return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
    }

    private html(webview: vscode.Webview): string {
        const nonce = Math.random().toString(36).slice(2);
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src ${webview.cspSource} 'unsafe-inline';script-src 'nonce-${nonce}';"><title>Model Cookbook</title><style>
*{box-sizing:border-box}body{margin:0;padding:12px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}header{display:flex;align-items:center;justify-content:space-between}h2{margin:0;font-size:13px}.icon{width:28px;height:26px;border:0;border-radius:3px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.hardware{margin:12px 0;padding:8px 0;border-block:1px solid var(--vscode-widget-border);color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.5}.model{padding:10px 0;border-bottom:1px solid var(--vscode-widget-border)}.title{display:flex;justify-content:space-between;gap:8px}.title strong{font-size:12px}.badge{color:var(--vscode-testing-iconPassed);font-size:11px}.meta,.description{margin-top:4px;color:var(--vscode-descriptionForeground);font-size:11px}.actions{display:flex;gap:5px;margin-top:8px}button{border:0;border-radius:3px;padding:5px 8px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:disabled{opacity:.5;cursor:default}
</style></head><body><header><h2>Local Model Cookbook</h2><button id="refresh" class="icon" title="Scan hardware" aria-label="Scan hardware">&#8635;</button></header><section id="hardware" class="hardware">Scanning hardware...</section><main id="models"></main><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),hardware=document.getElementById('hardware'),models=document.getElementById('models');document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});models.addEventListener('click',event=>{const modelId=event.target.dataset.model,action=event.target.dataset.action;if(modelId&&action)vscode.postMessage({type:action,modelId})});window.addEventListener('message',event=>{const message=event.data;if(message.type==='loading')hardware.textContent='Scanning hardware...';if(message.type==='catalog'){hardware.textContent=message.hardware.cpu+' · '+message.hardware.logicalCores+' logical cores · '+message.hardware.ramGb+' GB RAM'+(message.hardware.gpu?' · '+message.hardware.gpu:'')+(message.hardware.vramGb?' · '+message.hardware.vramGb+' GB reported VRAM':'');models.textContent='';message.models.forEach(model=>{const section=document.createElement('section');section.className='model';section.innerHTML='<div class="title"><strong></strong><span class="badge"></span></div><div class="meta"></div><div class="description"></div><div class="actions"><button data-action="pull">Pull with Ollama</button><button class="secondary" data-action="openModel">Model page ↗</button></div>';section.querySelector('strong').textContent=model.name+' '+model.parameterSize;section.querySelector('.badge').textContent=model.recommended?'Recommended':'';section.querySelector('.meta').textContent='Needs about '+model.minimumRamGb+' GB RAM'+(model.minimumVramGb?' / '+model.minimumVramGb+' GB VRAM':'');section.querySelector('.description').textContent=model.description;section.querySelectorAll('button').forEach(button=>button.dataset.model=model.id);models.appendChild(section)})}if(message.type==='pullStart'){const button=document.querySelector('[data-action="pull"][data-model="'+CSS.escape(message.modelId)+'"]');if(button){button.disabled=true;button.textContent='Pulling...'}}if(message.type==='pullDone'){const button=document.querySelector('[data-action="pull"][data-model="'+CSS.escape(message.modelId)+'"]');if(button){button.disabled=false;button.textContent=message.ok?'Installed':'Retry pull'}}});vscode.postMessage({type:'ready'});
</script></body></html>`;
    }
}