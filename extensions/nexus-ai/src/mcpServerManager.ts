import { spawn } from "node:child_process";
import {
    assessServerRisk,
    HttpMcpTransport,
    McpClient,
    McpServerDefinition,
    McpToolDescriptor,
    McpTransport,
    normalizeError,
    SecretStore,
    StdioMcpTransport,
} from "@nexus/ai-core";
import * as vscode from "vscode";
import { MCP_SECRET_PREFIX } from "./mcpServers";
import { admitConnection, McpTrustStore, TrustState } from "./mcpTrustStore";

export interface McpServerStatus {
    id: string;
    label: string;
    source: McpServerDefinition["source"];
    transport: "stdio" | "http";
    riskSummary: string;
    riskDetail: string;
    trust: TrustState;
    connected: boolean;
    status: string;
    serverName?: string;
    hasCredential: boolean;
    tools: readonly { name: string; title?: string; description?: string }[];
}

interface ActiveSession {
    client: McpClient;
    tools: readonly McpToolDescriptor[];
    serverName?: string;
    dispose(): void;
}

const CONNECT_TIMEOUT_MS = 15_000;

export class McpServerManager implements vscode.Disposable {
    private readonly sessions = new Map<string, ActiveSession>();
    private readonly errors = new Map<string, string>();

    public constructor(
        private readonly trustStore: McpTrustStore,
        private readonly secretStore: SecretStore,
        private readonly definitions: () => readonly McpServerDefinition[],
    ) {}

    public async status(): Promise<readonly McpServerStatus[]> {
        const statuses: McpServerStatus[] = [];
        for (const definition of this.definitions()) {
            const risk = assessServerRisk(definition);
            const session = this.sessions.get(definition.id);
            const trust = this.trustStore.state(definition);
            statuses.push({
                id: definition.id,
                label: definition.label,
                source: definition.source,
                transport: definition.connection.transport,
                riskSummary: risk.summary,
                riskDetail: risk.detail,
                trust,
                connected: Boolean(session),
                status: this.describeStatus(definition.id, trust, Boolean(session)),
                serverName: session?.serverName,
                hasCredential: Boolean(await this.secretStore.get(MCP_SECRET_PREFIX + definition.id)),
                tools: session?.tools.map(({ name, title, description }) => ({ name, title, description })) ?? [],
            });
        }
        return statuses;
    }

    /** Presents the exact executable surface and records trust only on explicit approval. */
    public async requestTrust(id: string): Promise<boolean> {
        const definition = this.find(id);
        if (!definition) {
            return false;
        }
        const risk = assessServerRisk(definition);
        const warning = definition.source === "workspace"
            ? "\n\nThis server was defined by the opened workspace, not by you. Only continue if you trust this repository."
            : "";
        const consequence = risk.level === "executes-local-code"
            ? "NexusIDE will run this program on your computer and expose its tools to the agent."
            : "NexusIDE will send tool requests, including data the agent chooses to include, to this endpoint.";
        const choice = await vscode.window.showWarningMessage(
            `Trust MCP server "${definition.label}"?`,
            { modal: true, detail: `${risk.summary}:\n${risk.detail}\n\n${consequence}${warning}` },
            "Trust Server",
        );
        if (choice !== "Trust Server") {
            return false;
        }
        await this.trustStore.trust(definition);
        return true;
    }

    public async revokeTrust(id: string): Promise<void> {
        await this.disconnect(id);
        await this.trustStore.revoke(id);
    }

    public async connect(id: string): Promise<void> {
        const definition = this.find(id);
        if (!definition) {
            return;
        }
        const admission = admitConnection({
            trust: this.trustStore.state(definition),
            transport: definition.connection.transport,
            workspaceTrusted: vscode.workspace.isTrusted,
        });
        if (!admission.allowed) {
            this.errors.set(id, admission.reason ?? "Connection refused.");
            return;
        }
        await this.disconnect(id);
        this.errors.delete(id);
        try {
            const session = await this.openSession(definition);
            this.sessions.set(id, session);
        } catch (error) {
            this.errors.set(id, normalizeError(error, `mcp:${id}`).message);
        }
    }

    public async disconnect(id: string): Promise<void> {
        const session = this.sessions.get(id);
        if (!session) {
            return;
        }
        this.sessions.delete(id);
        await session.client.close().catch(() => undefined);
        session.dispose();
    }

    public trustedDefinitions(): readonly McpServerDefinition[] {
        return this.definitions().filter((definition) => this.trustStore.isTrusted(definition));
    }

    public dispose(): void {
        for (const id of [...this.sessions.keys()]) {
            void this.disconnect(id);
        }
    }

    private find(id: string): McpServerDefinition | undefined {
        return this.definitions().find((definition) => definition.id === id);
    }

    private describeStatus(id: string, trust: TrustState, connected: boolean): string {
        const error = this.errors.get(id);
        if (error) {
            return error;
        }
        if (trust === "changed") {
            return "Definition changed since it was trusted";
        }
        if (trust === "untrusted") {
            return "Not trusted";
        }
        return connected ? "Connected" : "Trusted, not connected";
    }

    private async openSession(definition: McpServerDefinition): Promise<ActiveSession> {
        const signal = AbortSignal.timeout(CONNECT_TIMEOUT_MS);
        const { transport, dispose } = await this.createTransport(definition);
        const client = new McpClient(transport);
        try {
            const identity = await client.initialize(signal);
            const tools = await client.listTools(signal);
            return { client, tools, serverName: identity.name, dispose };
        } catch (error) {
            await client.close().catch(() => undefined);
            dispose();
            throw error;
        }
    }

    private async createTransport(definition: McpServerDefinition): Promise<{ transport: McpTransport; dispose(): void }> {
        const token = await this.secretStore.get(MCP_SECRET_PREFIX + definition.id);
        if (definition.connection.transport === "http") {
            return {
                transport: new HttpMcpTransport({
                    url: definition.connection.url,
                    headers: {
                        ...definition.connection.headers,
                        ...(token ? { authorization: `Bearer ${token}` } : {}),
                    },
                }),
                dispose: () => undefined,
            };
        }
        const child = spawn(definition.connection.command, [...(definition.connection.args ?? [])], {
            cwd: definition.connection.cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            env: { ...process.env, ...definition.connection.env, ...(token ? { MCP_TOKEN: token } : {}) },
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        });
        return {
            transport: new StdioMcpTransport({ stdin: child.stdin, stdout: child.stdout }),
            dispose: () => {
                if (!child.killed) {
                    child.kill();
                }
            },
        };
    }
}
