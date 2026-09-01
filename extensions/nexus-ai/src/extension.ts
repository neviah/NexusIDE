import * as vscode from "vscode";
import { CompletionRouter } from "@nexus/ai-core";
import { NexusChatViewProvider } from "./nexusChatViewProvider";
import { createProviderRegistry, CUSTOM_OPENAI_API_KEY, GROQ_API_KEY, NexusSecretStore, OPENROUTER_API_KEY } from "./providerRuntime";
import { ReadOnlyChatRuntime } from "./readOnlyChatRuntime";
import { ConversationStore } from "./conversationStore";
import { NexusRouterViewProvider } from "./nexusRouterViewProvider";
import { RouteStackStore } from "./routeStackStore";
import { WorkspaceContextCollector } from "./workspaceContext";
import { OpenCodeHarness } from "./openCodeHarness";
import { WorkspaceAgentHost } from "./workspaceAgentHost";
import { ProviderStateStore } from "./providerStateStore";
import { showLanguageToolingReport } from "./languageTooling";
import { buildSupportDiagnostics } from "./supportDiagnostics";
import { StartupRecovery } from "./startupRecovery";

const VIEW_ID = "nexusAI.chat";
const CONTAINER_ID = "workbench.view.extension.nexus-ai";
const ROUTER_VIEW_ID = "nexusRouter.providers";
let startupRecovery: StartupRecovery | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    startupRecovery = new StartupRecovery(context.globalState);
    const recoveryDetected = await startupRecovery.begin();
    if (recoveryDetected) {
        await vscode.window.showWarningMessage("Nexus AI recovered from an unclean shutdown. Completed conversations and provider settings were restored from validated state.");
    }
    const secretStore = new NexusSecretStore(context.secrets);
    const providers = createProviderRegistry(secretStore);
    const routeStack = new RouteStackStore(context.workspaceState);
    const providerState = new ProviderStateStore(context.globalState);
    if (!providerState.has("custom-openai")) {
        await providerState.configure("custom-openai", false, "Local or self-hosted endpoint; capacity is provider-defined.");
    }
    const completionRouter = new CompletionRouter({
        onRouteFailure: (observation) => providerState.recordFailure(observation),
        onQuota: (observation) => providerState.recordQuota(observation),
    });
    const languageToolingOutput = vscode.window.createOutputChannel("NexusIDE Language Tooling");
    const agentHost = new WorkspaceAgentHost();
    const openCodePath = vscode.workspace.getConfiguration("nexusAI").get("openCodePath", "").trim();
    const agentHarness = new OpenCodeHarness(agentHost, openCodePath || undefined, undefined, async () => {
        const openRouterKey = await secretStore.get(OPENROUTER_API_KEY);
        const groqKey = await secretStore.get(GROQ_API_KEY);
        return {
            ...(openRouterKey ? { OPENROUTER_API_KEY: openRouterKey } : {}),
            ...(groqKey ? { GROQ_API_KEY: groqKey } : {}),
        };
    });
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
    const configureCustomEndpoint = async (): Promise<void> => {
        const configuration = vscode.workspace.getConfiguration("nexusAI.customOpenAI");
        const baseUrl = await vscode.window.showInputBox({
            title: "Configure Custom OpenAI-Compatible Endpoint",
            prompt: "Enter the API base URL ending in /v1.",
            value: configuration.get("baseUrl", "http://127.0.0.1:1234/v1"),
            ignoreFocusOut: true,
            validateInput: validateProviderUrl,
        });
        if (!baseUrl) return;
        await configuration.update("baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
        await providerState.configure("custom-openai", true, providerState.provider("custom-openai").quotaNote);
        const apiKey = await vscode.window.showInputBox({
            title: "Optional Custom Endpoint API Key",
            prompt: "Leave empty when the endpoint does not require authentication.",
            password: true,
            ignoreFocusOut: true,
        });
        if (apiKey?.trim()) await secretStore.set(CUSTOM_OPENAI_API_KEY, apiKey.trim());
        await vscode.window.showInformationMessage("Custom OpenAI-compatible endpoint configured.");
    };
    const provider = new NexusChatViewProvider(
        context.extensionUri,
        new ReadOnlyChatRuntime(providers, secretStore, routeStack, completionRouter, providerState),
        new ConversationStore(context.workspaceState),
        new WorkspaceContextCollector(),
        agentHarness,
    );
    const routerProvider = new NexusRouterViewProvider(context.extensionUri, providers, secretStore, routeStack, providerState, {
        groq: { secretKey: GROQ_API_KEY, set: () => setProviderKey("Groq", GROQ_API_KEY) },
        openrouter: { secretKey: OPENROUTER_API_KEY, set: () => setProviderKey("OpenRouter", OPENROUTER_API_KEY) },
        "custom-openai": { secretKey: CUSTOM_OPENAI_API_KEY, set: configureCustomEndpoint },
    });

    context.subscriptions.push(
        agentHost,
        languageToolingOutput,
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
        vscode.commands.registerCommand("nexusAI.configureCustomOpenAI", configureCustomEndpoint),
        vscode.commands.registerCommand("nexusAI.deleteCustomOpenAIKey", async () => {
            await secretStore.delete(CUSTOM_OPENAI_API_KEY);
            await vscode.window.showInformationMessage("Custom endpoint credentials removed.");
        }),
        vscode.commands.registerCommand("nexusAI.checkLanguageTooling", () => showLanguageToolingReport(languageToolingOutput)),
        vscode.commands.registerCommand("nexusAI.exportSupportDiagnostics", async () => {
            const destination = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file("nexuside-support.json"),
                filters: { JSON: ["json"] },
                saveLabel: "Export Diagnostics",
            });
            if (!destination) return;
            const providerHealth = Object.fromEntries(["ollama", "groq", "openrouter", "custom-openai"].map((providerId) => {
                const settings = providerState.provider(providerId);
                return [providerId, { enabled: settings.enabled, health: settings.health?.status ?? "unknown" }];
            }));
            const report = buildSupportDiagnostics({
                generatedAt: new Date().toISOString(),
                nexusAIVersion: String(context.extension.packageJSON.version),
                vscodeVersion: vscode.version,
                platform: process.platform,
                architecture: process.arch,
                workspaceTrusted: vscode.workspace.isTrusted,
                workspaceFolderCount: vscode.workspace.workspaceFolders?.length ?? 0,
                recoveryDetected,
                remoteName: vscode.env.remoteName,
                providerHealth,
                logDirectories: [context.logUri.fsPath, context.globalStorageUri.fsPath],
            });
            await vscode.workspace.fs.writeFile(destination, Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8"));
            await vscode.window.showInformationMessage(`Support diagnostics exported to ${destination.fsPath}.`);
        }),
    );

    if (vscode.workspace.getConfiguration("nexusAI").get("openOnStartup", true)) {
        await vscode.commands.executeCommand("workbench.view.explorer");
        await vscode.commands.executeCommand(CONTAINER_ID);
    }
}

export async function deactivate(): Promise<void> {
    await startupRecovery?.markClean();
}

function validateProviderUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? undefined : "Use an http:// or https:// URL.";
    } catch {
        return "Enter a valid absolute URL.";
    }
}