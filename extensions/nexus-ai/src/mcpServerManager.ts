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
import { canonicalMcpResource, MCP_SECRET_PREFIX, protectedResourceMetadataUrl } from "./mcpServers";
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
    canAuthorize: boolean;
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
                canAuthorize: definition.connection.transport === "http" && trust === "trusted",
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

    /** Completes the OAuth device flow advertised by protected remote MCP servers. */
    public async authorize(id: string): Promise<void> {
        const definition = this.find(id);
        if (!definition || definition.connection.transport !== "http" || !this.trustStore.isTrusted(definition)) {
            return;
        }
        try {
            const endpoint = canonicalMcpResource(definition.connection.url);
            const metadata = await json<ProtectedResourceMetadata>(protectedResourceMetadataUrl(endpoint));
            const resource = canonicalMcpResource(metadata.resource ?? endpoint);
            const authorizationServer = metadata.authorization_servers?.[0];
            if (!authorizationServer) {
                throw new Error("The MCP server did not advertise an OAuth authorization server.");
            }
            const authorization = await json<AuthorizationServerMetadata>(`${authorizationServer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`);
            if (!authorization.registration_endpoint || !authorization.device_authorization_endpoint || !authorization.token_endpoint) {
                throw new Error("This MCP server requires OAuth, but does not support device authorization.");
            }
            const registration = await json<RegisteredClient>(authorization.registration_endpoint, {
                client_name: "NexusIDE",
                redirect_uris: ["http://127.0.0.1"],
                grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
                response_types: ["code"],
                token_endpoint_auth_method: "none",
                scope: metadata.scopes_supported?.join(" ") ?? "mcp:agent",
            });
            const device = await form<DeviceAuthorization>(authorization.device_authorization_endpoint, {
                client_id: registration.client_id,
                scope: metadata.scopes_supported?.join(" ") ?? "mcp:agent",
                resource,
            });
            await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri_complete ?? device.verification_uri));
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Sign in to ${definition.label}`,
                cancellable: true,
            }, async (progress, cancellation) => {
                progress.report({ message: `Enter code ${device.user_code} in your browser.` });
                const token = await pollForToken(authorization.token_endpoint!, registration.client_id, device, resource, cancellation);
                await this.secretStore.set(MCP_SECRET_PREFIX + definition.id, token.access_token);
            });
            this.errors.delete(id);
            await this.connect(id);
        } catch (error) {
            this.errors.set(id, normalizeError(error, `mcp:${id}`).message);
        }
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

interface ProtectedResourceMetadata {
    resource?: string;
    authorization_servers?: string[];
    scopes_supported?: string[];
}

interface AuthorizationServerMetadata {
    registration_endpoint?: string;
    device_authorization_endpoint?: string;
    token_endpoint?: string;
}

interface RegisteredClient {
    client_id: string;
}

interface DeviceAuthorization {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    interval?: number;
}

interface TokenResponse {
    access_token: string;
    error?: string;
}

async function json<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, body === undefined ? { headers: { accept: "application/json" } } : {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OAuth server responded ${response.status} ${response.statusText}.`);
    return await response.json() as T;
}

async function form<T>(url: string, values: Record<string, string>): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams(values),
    });
    if (!response.ok) throw new Error(`OAuth server responded ${response.status} ${response.statusText}.`);
    return await response.json() as T;
}

async function pollForToken(tokenEndpoint: string, clientId: string, device: DeviceAuthorization, resource: string, cancellation: vscode.CancellationToken): Promise<TokenResponse> {
    const deadline = Date.now() + 600_000;
    const interval = Math.max(device.interval ?? 5, 1) * 1_000;
    while (!cancellation.isCancellationRequested && Date.now() < deadline) {
        await delay(interval, cancellation);
        const response = await fetch(tokenEndpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: device.device_code, client_id: clientId, resource }),
        });
        const token = await response.json() as TokenResponse;
        if (response.ok && token.access_token) return token;
        if (token.error !== "authorization_pending" && token.error !== "slow_down") throw new Error(`OAuth authorization failed: ${token.error ?? response.statusText}.`);
    }
    throw new Error(cancellation.isCancellationRequested ? "OAuth sign-in cancelled." : "OAuth sign-in expired.");
}

function delay(milliseconds: number, cancellation: vscode.CancellationToken): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        cancellation.onCancellationRequested(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}
