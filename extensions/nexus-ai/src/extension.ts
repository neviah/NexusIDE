import * as vscode from "vscode";
import { NexusChatViewProvider } from "./nexusChatViewProvider";
import { createProviderRegistry, GROQ_API_KEY, NexusSecretStore, OPENROUTER_API_KEY } from "./providerRuntime";
import { ReadOnlyChatRuntime } from "./readOnlyChatRuntime";
import { ConversationStore } from "./conversationStore";
import { NexusRouterViewProvider } from "./nexusRouterViewProvider";
import { RouteStackStore } from "./routeStackStore";
import { WorkspaceContextCollector } from "./workspaceContext";

const VIEW_ID = "nexusAI.chat";
const CONTAINER_ID = "workbench.view.extension.nexus-ai";
const ROUTER_VIEW_ID = "nexusRouter.providers";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const secretStore = new NexusSecretStore(context.secrets);
    const providers = createProviderRegistry(secretStore);
    const routeStack = new RouteStackStore(context.workspaceState);
    const setProviderKey = async (provider: "Groq" | "OpenRouter", secretKey: string): Promise<void> => {
        const apiKey = await vscode.window.showInputBox({
            title: `Set ${provider} API Key`,
            prompt: provider === "OpenRouter" ? "Only currently verified free models enter automatic routing. The key is stored in the operating system credential store." : "The key is stored in the operating system credential store and is never sent to the webview.",
            password: true,
            ignoreFocusOut: true,
        });
        if (apiKey?.trim()) {
            await secretStore.set(secretKey, apiKey.trim());
            await vscode.window.showInformationMessage(`${provider} credentials stored securely.`);
        }
    };
    const provider = new NexusChatViewProvider(
        context.extensionUri,
        new ReadOnlyChatRuntime(providers, secretStore, routeStack),
        new ConversationStore(context.workspaceState),
        new WorkspaceContextCollector(),
    );
    const routerProvider = new NexusRouterViewProvider(context.extensionUri, providers, secretStore, routeStack, {
        groq: { secretKey: GROQ_API_KEY, set: () => setProviderKey("Groq", GROQ_API_KEY) },
        openrouter: { secretKey: OPENROUTER_API_KEY, set: () => setProviderKey("OpenRouter", OPENROUTER_API_KEY) },
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.window.registerWebviewViewProvider(ROUTER_VIEW_ID, routerProvider),
        vscode.commands.registerCommand("nexusAI.open", async () => {
            await vscode.commands.executeCommand(CONTAINER_ID);
        }),
        vscode.commands.registerCommand("nexusAI.setGroqApiKey", async () => {
            await setProviderKey("Groq", GROQ_API_KEY);
        }),
        vscode.commands.registerCommand("nexusAI.deleteGroqApiKey", async () => {
            await secretStore.delete(GROQ_API_KEY);
            await vscode.window.showInformationMessage("Groq credentials removed.");
        }),
        vscode.commands.registerCommand("nexusAI.setOpenRouterApiKey", async () => {
            await setProviderKey("OpenRouter", OPENROUTER_API_KEY);
        }),
        vscode.commands.registerCommand("nexusAI.deleteOpenRouterApiKey", async () => {
            await secretStore.delete(OPENROUTER_API_KEY);
            await vscode.window.showInformationMessage("OpenRouter credentials removed.");
        }),
    );

    if (vscode.workspace.getConfiguration("nexusAI").get("openOnStartup", true)) {
        await vscode.commands.executeCommand("workbench.view.explorer");
        await vscode.commands.executeCommand(CONTAINER_ID);
    }
}

export function deactivate(): void {}