import { McpConnection, McpServerDefinition, validateServerDefinition } from "@nexus/ai-core";

export const UNITY_SERVER_ID = "unity";
export const UNITY_DEFAULT_URL = "http://localhost:8080";
export const MCP_SECRET_PREFIX = "mcp.";

export interface ServerConfigurationScopes {
    global?: unknown;
    workspace?: unknown;
    workspaceFolder?: unknown;
}

/**
 * Workspace-scoped settings travel inside cloned repositories, so a definition found there is
 * attacker-controlled. Scope is preserved as the definition source and never collapsed.
 */
export function parseServerDefinitions(scopes: ServerConfigurationScopes): readonly McpServerDefinition[] {
    const definitions = new Map<string, McpServerDefinition>();
    for (const [source, value] of [
        ["user", scopes.global],
        ["workspace", scopes.workspace],
        ["workspace", scopes.workspaceFolder],
    ] as const) {
        for (const [id, entry] of Object.entries(asRecord(value) ?? {})) {
            const record = asRecord(entry);
            const connection = parseConnection(record);
            if (!connection) {
                continue;
            }
            const label = typeof record?.label === "string" ? record.label : id;
            const definition: McpServerDefinition = { id, label, source, connection };
            if (!validateServerDefinition(definition)) {
                definitions.set(id, definition);
            }
        }
    }
    return [...definitions.values()];
}

export function unityServerDefinition(url: string): McpServerDefinition {
    return {
        id: UNITY_SERVER_ID,
        label: "Unity Editor",
        source: "builtin",
        connection: { transport: "http", url: url.trim() || UNITY_DEFAULT_URL },
    };
}

/** A configured entry named "unity" wins so the built-in preset never overrides an explicit choice. */
export function mergeUnityPreset(configured: readonly McpServerDefinition[], unityUrl: string): readonly McpServerDefinition[] {
    return configured.some(({ id }) => id === UNITY_SERVER_ID)
        ? configured
        : [unityServerDefinition(unityUrl), ...configured];
}

function parseConnection(entry: Record<string, unknown> | undefined): McpConnection | undefined {
    if (!entry) {
        return undefined;
    }
    if (entry.transport === "stdio" && typeof entry.command === "string") {
        return {
            transport: "stdio",
            command: entry.command,
            args: Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === "string") : undefined,
            env: asStringRecord(entry.env),
            cwd: typeof entry.cwd === "string" ? entry.cwd : undefined,
        };
    }
    if (entry.transport === "http" && typeof entry.url === "string") {
        return { transport: "http", url: entry.url, headers: asStringRecord(entry.headers) };
    }
    return undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    const record = asRecord(value);
    if (!record) {
        return undefined;
    }
    const entries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    return entries.length ? Object.fromEntries(entries) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Splits a typed command into a program and arguments, keeping quoted Windows paths intact. */
export function parseCommandLine(input: string): { command: string; args: string[] } {
    const tokens = input.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const [command = "", ...args] = tokens.map((token) => /^(["']).*\1$/.test(token) ? token.slice(1, -1) : token);
    return { command, args };
}
