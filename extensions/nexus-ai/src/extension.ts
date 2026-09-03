import * as vscode from "vscode";
import { CompletionRouter } from "@nexus/ai-core";
import { NexusChatViewProvider } from "./nexusChatViewProvider";
import { CATALOG_PROVIDER_DEFINITIONS, createProviderRegistry, CUSTOM_OPENAI_API_KEY, GROQ_API_KEY, NexusSecretStore, OPENROUTER_API_KEY } from "./providerRuntime";
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
import { CookbookViewProvider } from "./cookbookViewProvider";
import { RouteStackViewProvider } from "./routeStackViewProvider";
import { McpTrustStore } from "./mcpTrustStore";
import { McpServerManager } from "./mcpServerManager";
import { McpViewProvider } from "./mcpViewProvider";
import { findUnityProjects, MCP_SECRET_PREFIX, parseCommandLine, readServerDefinitions, UNITY_DEFAULT_URL, UNITY_SERVER_ID } from "./mcpServers";
import { bootstrapUnityProject } from "./unityBootstrap";

const VIEW_ID = "nexusAI.chat";
const CONTAINER_ID = "workbench.view.extension.nexus-ai";
const ROUTER_VIEW_ID = "nexusRouter.providers";
const STACK_VIEW_ID = "nexusRouter.stack";
const COOKBOOK_VIEW_ID = "nexusCookbook.models";
const MCP_VIEW_ID = "nexusRouter.mcp";
let startupRecovery: StartupRecovery | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    startupRecovery = new StartupRecovery(context.globalState);
    const recoveryDetected = await startupRecovery.begin();
    if (recoveryDetected) {
        void vscode.window.showWarningMessage("Nexus AI recovered from an unclean shutdown. Completed conversations and provider settings were restored from validated state.");
    }
    const secretStore = new NexusSecretStore(context.secrets);
    const providers = createProviderRegistry(secretStore);
    const routeStack = new RouteStackStore(context.globalState);
    const providerState = new ProviderStateStore(context.globalState);
    if (!providerState.has("custom-openai")) {
        await providerState.configure("custom-openai", false, "Local or self-hosted endpoint; capacity is provider-defined.");
    }
    const completionRouter = new CompletionRouter({
        onRouteFailure: (observation) => providerState.recordFailure(observation),
        onQuota: (observation) => providerState.recordQuota(observation),
    });
    const languageToolingOutput = vscode.window.createOutputChannel("NexusIDE Language Tooling");
    const agentHost = new WorkspaceAgentHost(context.workspaceState);
    const openCodePath = vscode.workspace.getConfiguration("nexusAI").get("openCodePath", "").trim();
    const mcpTrust = new McpTrustStore(context.globalState);
    const mcpManager = new McpServerManager(mcpTrust, secretStore, readServerDefinitions);
    const agentHarness = new OpenCodeHarness(agentHost, openCodePath || undefined, undefined, async () => {
        const openRouterKey = await secretStore.get(OPENROUTER_API_KEY);
        const groqKey = await secretStore.get(GROQ_API_KEY);
        const environment: NodeJS.ProcessEnv = {
            ...(openRouterKey ? { OPENROUTER_API_KEY: openRouterKey } : {}),
            ...(groqKey ? { GROQ_API_KEY: groqKey } : {}),
        };
        for (const provider of CATALOG_PROVIDER_DEFINITIONS) {
            const apiKey = await secretStore.get(provider.secretKey);
            if (apiKey) environment[provider.environmentKey] = apiKey;
        }
        return environment;
    }, async () => {
        const trusted = mcpManager.trustedDefinitions();
        return await Promise.all(trusted.map(async (definition) => ({
            id: definition.id,
            connection: definition.connection,
            token: await secretStore.get(MCP_SECRET_PREFIX + definition.id),
        })));
    }, () => vscode.workspace.getConfiguration("nexusAI").get<"coding" | "unity" | "review">("agentProfile", "coding"));
    const setProviderKey = async (provider: string, secretKey: string): Promise<void> => {
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
        routeStack,
    );
    const credentialActions = Object.fromEntries(CATALOG_PROVIDER_DEFINITIONS.map((provider) => [provider.id, {
        secretKey: provider.secretKey,
        set: () => setProviderKey(provider.displayName, provider.secretKey),
    }]));
    const routerProvider = new NexusRouterViewProvider(context.extensionUri, providers, secretStore, routeStack, providerState, {
        ...credentialActions,
        groq: { secretKey: GROQ_API_KEY, set: () => setProviderKey("Groq", GROQ_API_KEY) },
        openrouter: { secretKey: OPENROUTER_API_KEY, set: () => setProviderKey("OpenRouter", OPENROUTER_API_KEY) },
        "custom-openai": { secretKey: CUSTOM_OPENAI_API_KEY, set: configureCustomEndpoint },
    });
    const cookbookProvider = new CookbookViewProvider();
    const stackProvider = new RouteStackViewProvider(providers, routeStack, providerState);
    const setMcpToken = async (id: string): Promise<void> => {
        const token = await vscode.window.showInputBox({
            title: `Set Token for MCP Server "${id}"`,
            prompt: "Sent as an Authorization bearer header. Stored in the operating system credential store.",
            password: true,
            ignoreFocusOut: true,
        });
        if (token?.trim()) {
            await secretStore.set(MCP_SECRET_PREFIX + id, token.trim());
            await vscode.window.showInformationMessage(`Token stored for MCP server "${id}".`);
        }
    };
    const addMcpServer = async (): Promise<void> => {
        const transport = await vscode.window.showQuickPick(
            [
                { label: "Remote or local endpoint (http)", value: "http" as const },
                { label: "Local program (stdio)", value: "stdio" as const, detail: "Runs a program on this computer" },
            ],
            { title: "Add MCP Server", placeHolder: "Choose how NexusIDE reaches the server" },
        );
        if (!transport) return;
        const id = await vscode.window.showInputBox({
            title: "MCP Server Id",
            prompt: "Short identifier, for example unity.",
            ignoreFocusOut: true,
            validateInput: (value) => /^[a-z0-9][a-z0-9._-]*$/i.test(value.trim()) ? undefined : "Use letters, digits, dots, dashes, or underscores.",
        });
        if (!id) return;
        const entry = transport.value === "http"
            ? await (async () => {
                const url = await vscode.window.showInputBox({
                    title: "MCP Server URL",
                    prompt: "Endpoint of the MCP server.",
                    ignoreFocusOut: true,
                    validateInput: validateProviderUrl,
                });
                return url ? { transport: "http", url: url.trim() } : undefined;
            })()
            : await (async () => {
                const command = await vscode.window.showInputBox({
                    title: "MCP Server Command",
                    prompt: "Command and arguments, for example: npx -y my-mcp-server",
                    ignoreFocusOut: true,
                    validateInput: (value) => value.trim() ? undefined : "Enter the command that starts the server.",
                });
                if (!command?.trim()) return undefined;
                const { command: executable, args } = parseCommandLine(command);
                return { transport: "stdio", command: executable, args };
            })();
        if (!entry) return;
        const configuration = vscode.workspace.getConfiguration("nexusAI.mcp");
        const existing = configuration.inspect<Record<string, unknown>>("servers")?.globalValue ?? {};
        await configuration.update("servers", { ...existing, [id.trim()]: entry }, vscode.ConfigurationTarget.Global);
        await vscode.window.showInformationMessage(`MCP server "${id.trim()}" added. Trust it in the MCP Servers view before it runs.`);
    };
    const mcpProvider = new McpViewProvider(context.extensionUri, mcpManager, {
        setToken: setMcpToken,
        deleteToken: async (id) => {
            await secretStore.delete(MCP_SECRET_PREFIX + id);
            await vscode.window.showInformationMessage(`Token removed for MCP server "${id}".`);
        },
        addServer: addMcpServer,
    });

    context.subscriptions.push(
        agentHost,
        stackProvider,
        mcpManager,
        languageToolingOutput,
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.window.registerWebviewViewProvider(ROUTER_VIEW_ID, routerProvider),
        vscode.window.registerWebviewViewProvider(STACK_VIEW_ID, stackProvider),
        vscode.window.registerWebviewViewProvider(COOKBOOK_VIEW_ID, cookbookProvider),
        vscode.window.registerWebviewViewProvider(MCP_VIEW_ID, mcpProvider),
        vscode.commands.registerCommand("nexusAI.bootstrapUnityProject", async () => {
            const root = vscode.workspace.workspaceFolders?.[0];
            if (!root) return;
            const choice = await vscode.window.showWarningMessage("Create missing Unity starter folders and AGENTS.md in this workspace?", { modal: true }, "Bootstrap Unity Project");
            if (choice !== "Bootstrap Unity Project") return;
            const created = await bootstrapUnityProject(root.uri);
            await vscode.window.showInformationMessage(created.length ? `Created: ${created.join(", ")}` : "Unity project conventions are already present.");
        }),
        vscode.commands.registerCommand("nexusAI.runProviderSmokeCheck", async () => {
            const report = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Checking configured free providers" }, async () => {
                const results: string[] = [];
                for (const adapter of providers.list()) {
                    const manifest = adapter.manifest();
                    const auth = await adapter.authenticate(secretStore);
                    if (!auth.authenticated) {
                        await providerState.recordSmoke(manifest.id, "skipped", "No credentials configured");
                        continue;
                    }
                    try {
                        const health = await adapter.health(AbortSignal.timeout(10_000));
                        const outcome = health.status === "unavailable" ? "failed" : "passed";
                        await providerState.recordSmoke(manifest.id, outcome, health.message ?? health.status);
                        results.push(`${manifest.displayName}: ${outcome}`);
                    } catch {
                        await providerState.recordSmoke(manifest.id, "failed", "Health check failed");
                        results.push(`${manifest.displayName}: failed`);
                    }
                }
                return results;
            });
            await vscode.window.showInformationMessage(report.length ? report.join("; ") : "No configured providers to check.");
            await routerProvider.refresh();
        }),
        vscode.commands.registerCommand("nexusAI.addMcpServer", addMcpServer),
        vscode.commands.registerCommand("nexusAI.connectUnityMcp", async () => {
            const configuration = vscode.workspace.getConfiguration("nexusAI.mcp");
            const url = await vscode.window.showInputBox({
                title: "Connect Unity MCP Server",
                prompt: "Endpoint shown in the Unity 'AI Game Developer' window. Unity must be open with the plugin installed.",
                value: configuration.get("unityUrl", UNITY_DEFAULT_URL),
                ignoreFocusOut: true,
                validateInput: validateProviderUrl,
            });
            if (!url) return;
            await configuration.update("unityUrl", url.trim(), vscode.ConfigurationTarget.Global);
            if (await mcpManager.requestTrust(UNITY_SERVER_ID)) {
                await mcpManager.connect(UNITY_SERVER_ID);
            }
            await mcpProvider.refresh();
            const status = (await mcpManager.status()).find(({ id }) => id === UNITY_SERVER_ID);
            await vscode.window.showInformationMessage(`Unity MCP: ${status?.status ?? "unavailable"}`);
        }),
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
            const providerHealth = Object.fromEntries(providers.list().map((adapter) => {
                const providerId = adapter.manifest().id;
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

    void notifyUnityProject(mcpManager);
}

/** Unity projects are offered the connector once trust is still absent; nothing connects implicitly. */
async function notifyUnityProject(manager: McpServerManager): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length || (await findUnityProjects(folders)).length === 0) {
        return;
    }
    const unity = (await manager.status()).find(({ id }) => id === UNITY_SERVER_ID);
    if (!unity || unity.trust === "trusted") {
        return;
    }
    const choice = await vscode.window.showInformationMessage(
        "Unity project detected. Connect the Unity MCP server to give Agent mode Unity Editor tools?",
        "Connect Unity MCP",
    );
    if (choice === "Connect Unity MCP") {
        await vscode.commands.executeCommand("nexusAI.connectUnityMcp");
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