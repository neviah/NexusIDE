import * as vscode from "vscode";
import { NexusChatViewProvider } from "./nexusChatViewProvider";
import { createProviderRegistry, GROQ_API_KEY, NexusSecretStore } from "./providerRuntime";

const VIEW_ID = "nexusAI.chat";
const CONTAINER_ID = "workbench.view.extension.nexus-ai";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const secretStore = new NexusSecretStore(context.secrets);
    const providers = createProviderRegistry(secretStore);
    const provider = new NexusChatViewProvider(context.extensionUri, providers.list().map((adapter) => adapter.manifest().displayName));

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand("nexusAI.open", async () => {
            await vscode.commands.executeCommand(CONTAINER_ID);
        }),
        vscode.commands.registerCommand("nexusAI.setGroqApiKey", async () => {
            const apiKey = await vscode.window.showInputBox({
                title: "Set Groq API Key",
                prompt: "The key is stored in the operating system credential store and is never sent to the webview.",
                password: true,
                ignoreFocusOut: true,
            });
            if (apiKey?.trim()) {
                await secretStore.set(GROQ_API_KEY, apiKey.trim());
                await vscode.window.showInformationMessage("Groq credentials stored securely.");
            }
        }),
        vscode.commands.registerCommand("nexusAI.deleteGroqApiKey", async () => {
            await secretStore.delete(GROQ_API_KEY);
            await vscode.window.showInformationMessage("Groq credentials removed.");
        }),
    );

    if (vscode.workspace.getConfiguration("nexusAI").get("openOnStartup", true)) {
        await vscode.commands.executeCommand("workbench.view.explorer");
        await vscode.commands.executeCommand(CONTAINER_ID);
    }
}

export function deactivate(): void {}