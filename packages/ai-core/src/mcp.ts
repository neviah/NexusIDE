import { createHash } from "node:crypto";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpStdioConnection {
    transport: "stdio";
    command: string;
    args?: readonly string[];
    env?: Readonly<Record<string, string>>;
    cwd?: string;
}

export interface McpHttpConnection {
    transport: "http";
    url: string;
    headers?: Readonly<Record<string, string>>;
}

export type McpConnection = McpStdioConnection | McpHttpConnection;

/** Where a definition came from. Workspace definitions are attacker-controlled in a cloned repository. */
export type McpDefinitionSource = "builtin" | "user" | "workspace";

export interface McpServerDefinition {
    id: string;
    label: string;
    source: McpDefinitionSource;
    connection: McpConnection;
}

export interface McpToolDescriptor {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: unknown;
}

export interface McpServerIdentity {
    name?: string;
    version?: string;
}

export interface McpToolResult {
    text: string;
    isError: boolean;
}

export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: unknown;
}

export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: unknown;
}

export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: number | string | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

export interface McpTransport {
    request(message: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse>;
    notify(message: JsonRpcNotification, signal: AbortSignal): Promise<void>;
    close(): Promise<void>;
}

/**
 * Stable identity of everything a definition can execute or reach.
 * Trust is bound to this so an edited command or relocated endpoint revokes prior approval.
 * Values are hashed, so secrets in env never leave this function.
 */
export function serverFingerprint(connection: McpConnection): string {
    const material = connection.transport === "stdio"
        ? JSON.stringify({
            transport: "stdio",
            command: connection.command.trim(),
            args: [...(connection.args ?? [])],
            cwd: connection.cwd ?? "",
            env: Object.entries(connection.env ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        })
        : JSON.stringify({
            transport: "http",
            url: normalizeUrl(connection.url),
            // Header names bind, values do not: rotating a bearer token must not silently revoke trust.
            headerNames: Object.keys(connection.headers ?? {}).map((name) => name.toLowerCase()).sort(),
        });
    return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export type McpRiskLevel = "executes-local-code" | "sends-data-remotely" | "local-endpoint";

export interface McpRiskAssessment {
    level: McpRiskLevel;
    summary: string;
    detail: string;
}

export function assessServerRisk(definition: McpServerDefinition): McpRiskAssessment {
    if (definition.connection.transport === "stdio") {
        const command = [definition.connection.command, ...(definition.connection.args ?? [])].join(" ");
        return {
            level: "executes-local-code",
            summary: "Runs a program on this computer",
            detail: command,
        };
    }
    const { url } = definition.connection;
    return isLoopbackUrl(url)
        ? { level: "local-endpoint", summary: "Connects to a service on this computer", detail: url }
        : { level: "sends-data-remotely", summary: "Sends requests to a remote server", detail: url };
}

export function isLoopbackUrl(value: string): boolean {
    try {
        const { hostname } = new URL(value);
        const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
        return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
    } catch {
        return false;
    }
}

export function validateServerDefinition(definition: McpServerDefinition): string | undefined {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(definition.id)) {
        return "Server id must be alphanumeric with dots, dashes, or underscores.";
    }
    if (definition.connection.transport === "stdio") {
        return definition.connection.command.trim() ? undefined : "Provide the command that starts the server.";
    }
    try {
        const { protocol } = new URL(definition.connection.url);
        return protocol === "http:" || protocol === "https:" ? undefined : "Use an http:// or https:// URL.";
    } catch {
        return "Enter a valid absolute URL.";
    }
}

export class McpClient {
    private nextId = 1;
    private initialized = false;
    private identity: McpServerIdentity = {};

    public constructor(private readonly transport: McpTransport) {}

    public async initialize(signal: AbortSignal): Promise<McpServerIdentity> {
        const response = await this.send("initialize", {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "NexusIDE", version: "0.1.0" },
        }, signal);
        const info = asRecord(response)?.serverInfo;
        const record = asRecord(info);
        this.identity = {
            name: typeof record?.name === "string" ? record.name : undefined,
            version: typeof record?.version === "string" ? record.version : undefined,
        };
        await this.transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" }, signal);
        this.initialized = true;
        return this.identity;
    }

    public serverIdentity(): McpServerIdentity {
        return this.identity;
    }

    public async listTools(signal: AbortSignal): Promise<readonly McpToolDescriptor[]> {
        this.assertInitialized();
        const result = asRecord(await this.send("tools/list", {}, signal));
        const tools = Array.isArray(result?.tools) ? result.tools : [];
        return tools.flatMap((entry) => {
            const tool = asRecord(entry);
            return typeof tool?.name === "string"
                ? [{
                    name: tool.name,
                    title: typeof tool.title === "string" ? tool.title : undefined,
                    description: typeof tool.description === "string" ? tool.description : undefined,
                    inputSchema: tool.inputSchema,
                }]
                : [];
        });
    }

    public async callTool(name: string, args: unknown, signal: AbortSignal): Promise<McpToolResult> {
        this.assertInitialized();
        const result = asRecord(await this.send("tools/call", { name, arguments: args ?? {} }, signal));
        const content = Array.isArray(result?.content) ? result.content : [];
        const text = content.flatMap((entry) => {
            const block = asRecord(entry);
            return block?.type === "text" && typeof block.text === "string" ? [block.text] : [];
        }).join("\n");
        return { text, isError: result?.isError === true };
    }

    public async close(): Promise<void> {
        this.initialized = false;
        await this.transport.close();
    }

    private assertInitialized(): void {
        if (!this.initialized) {
            throw new Error("MCP session is not initialized.");
        }
    }

    private async send(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
        const response = await this.transport.request({ jsonrpc: "2.0", id: this.nextId++, method, params }, signal);
        if (response.error) {
            throw new Error(`MCP ${method} failed: ${response.error.message}`);
        }
        return response.result;
    }
}

function normalizeUrl(value: string): string {
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
    } catch {
        return value.trim();
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
