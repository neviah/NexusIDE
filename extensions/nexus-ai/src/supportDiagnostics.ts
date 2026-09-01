const SENSITIVE_KEY = /(api[-_]?key|authorization|cookie|credential|password|prompt|secret|token)/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const API_KEY_VALUE = /\b(?:sk|gsk|key)-[A-Za-z0-9_-]{8,}\b/g;

export interface SupportDiagnosticsInput {
    generatedAt: string;
    nexusAIVersion: string;
    vscodeVersion: string;
    platform: string;
    architecture: string;
    workspaceTrusted: boolean;
    workspaceFolderCount: number;
    recoveryDetected: boolean;
    remoteName?: string;
    providerHealth: Record<string, unknown>;
    logDirectories: readonly string[];
}

export function buildSupportDiagnostics(input: SupportDiagnosticsInput): Record<string, unknown> {
    return redactDiagnostics({
        schemaVersion: 1,
        ...input,
    }) as Record<string, unknown>;
}

export function redactDiagnostics(value: unknown, key = ""): unknown {
    if (SENSITIVE_KEY.test(key)) {
        return "[redacted]";
    }
    if (typeof value === "string") {
        return value.replace(BEARER_VALUE, "Bearer [redacted]").replace(API_KEY_VALUE, "[redacted]");
    }
    if (Array.isArray(value)) {
        return value.map((entry) => redactDiagnostics(entry));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
            entryKey,
            redactDiagnostics(entryValue, entryKey),
        ]));
    }
    return value;
}