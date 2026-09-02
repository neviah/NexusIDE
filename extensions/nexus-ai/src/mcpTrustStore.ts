import { McpDefinitionSource, McpServerDefinition, serverFingerprint } from "@nexus/ai-core";

const STORAGE_KEY = "nexusAI.mcp.trust.v1";

export interface TrustRecord {
    fingerprint: string;
    grantedAt: string;
    source?: McpDefinitionSource;
}

export interface TrustStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

export type TrustState = "trusted" | "untrusted" | "changed";

/**
 * Trust is granted per server and bound to its fingerprint. Editing a trusted server's
 * command or endpoint produces a new fingerprint, which returns it to "changed" and
 * forces a fresh decision instead of silently reusing the old grant.
 */
export class McpTrustStore {
    public constructor(private readonly storage: TrustStorage) {}

    public state(definition: McpServerDefinition): TrustState {
        const record = this.read()[definition.id];
        if (!record) {
            return "untrusted";
        }
        if (record.fingerprint !== serverFingerprint(definition.connection)) {
            return "changed";
        }
        // A grant made for your own settings never carries over to a definition supplied by a
        // workspace, even when the executable surface is identical. Records predating this field
        // have no source and therefore fail closed for workspace definitions.
        if (definition.source === "workspace" && record.source !== "workspace") {
            return "changed";
        }
        return "trusted";
    }

    public isTrusted(definition: McpServerDefinition): boolean {
        return this.state(definition) === "trusted";
    }

    public grantedAt(id: string): string | undefined {
        return this.read()[id]?.grantedAt;
    }

    public async trust(definition: McpServerDefinition, now = new Date()): Promise<void> {
        const records = { ...this.read() };
        records[definition.id] = {
            fingerprint: serverFingerprint(definition.connection),
            grantedAt: now.toISOString(),
            source: definition.source,
        };
        await this.storage.update(STORAGE_KEY, records);
    }

    public async revoke(id: string): Promise<void> {
        const records = { ...this.read() };
        delete records[id];
        await this.storage.update(STORAGE_KEY, records);
    }

    private read(): Record<string, TrustRecord> {
        const value = this.storage.get<unknown>(STORAGE_KEY, {});
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }
        const records: Record<string, TrustRecord> = {};
        for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
            if (entry && typeof entry === "object" && !Array.isArray(entry)) {
                const { fingerprint, grantedAt, source } = entry as Record<string, unknown>;
                if (typeof fingerprint === "string" && typeof grantedAt === "string") {
                    records[id] = {
                        fingerprint,
                        grantedAt,
                        source: source === "builtin" || source === "user" || source === "workspace" ? source : undefined,
                    };
                }
            }
        }
        return records;
    }
}

export interface AdmissionInput {
    trust: TrustState;
    transport: "stdio" | "http";
    workspaceTrusted: boolean;
}

export interface AdmissionDecision {
    allowed: boolean;
    reason?: string;
}

/**
 * The single gate every connection passes. Untrusted and changed definitions never start, and
 * launching a local process additionally requires an already trusted workspace.
 */
export function admitConnection({ trust, transport, workspaceTrusted }: AdmissionInput): AdmissionDecision {
    if (trust === "changed") {
        return { allowed: false, reason: "Definition changed since it was trusted. Review it again." };
    }
    if (trust !== "trusted") {
        return { allowed: false, reason: "Trust this server before connecting." };
    }
    if (transport === "stdio" && !workspaceTrusted) {
        return { allowed: false, reason: "Local MCP servers require a trusted workspace." };
    }
    return { allowed: true };
}
