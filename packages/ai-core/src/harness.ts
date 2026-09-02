export type HarnessCapability =
    | "ask"
    | "design"
    | "read-files"
    | "edit-files"
    | "run-commands"
    | "stream-progress"
    | "cancel";

export interface HarnessManifest {
    id: string;
    displayName: string;
    capabilities: readonly HarnessCapability[];
}

export interface AgentRequest {
    runId: string;
    prompt: string;
    workspaceRoots: readonly string[];
    modelSelection?: "auto" | "ollama" | "openrouter" | "groq";
    preferredRoutes?: readonly string[];
}

export interface AgentChangedFile {
    path: string;
    status: "created" | "modified" | "deleted";
}

export interface AgentValidation {
    command: string;
    exitCode: number | null;
    output: string;
}

export interface AgentRunSummary {
    status: "completed" | "cancelled" | "failed";
    changedFiles: readonly AgentChangedFile[];
    validations: readonly AgentValidation[];
    message?: string;
}

export type AgentEvent =
    | { type: "progress"; message: string }
    | { type: "text-delta"; text: string }
    | { type: "tool"; toolCallId: string; title: string; kind: string; status: "pending" | "in-progress" | "completed" | "failed" }
    | { type: "permission"; toolCallId: string; title: string; locations: readonly string[] }
    | { type: "command-output"; terminalId: string; output: string; truncated?: boolean }
    | { type: "file-change"; change: AgentChangedFile }
    | { type: "complete"; summary: AgentRunSummary }
    | { type: "cancelled"; summary: AgentRunSummary }
    | { type: "failure"; error: string; summary: AgentRunSummary };

export interface CodingHarness {
    describe(): HarnessManifest;
    start(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentEvent>;
    cancel(runId: string): Promise<void>;
}

export const REQUIRED_AGENT_CAPABILITIES = [
    "read-files",
    "edit-files",
    "run-commands",
    "stream-progress",
    "cancel",
] as const satisfies readonly HarnessCapability[];

export interface HarnessQualification {
    mode: "agent" | "ask-only" | "ineligible";
    missing: readonly HarnessCapability[];
}

export function qualifyHarness(manifest: HarnessManifest): HarnessQualification {
    const capabilities = new Set(manifest.capabilities);
    const missing = REQUIRED_AGENT_CAPABILITIES.filter((capability) => !capabilities.has(capability));
    return {
        mode: missing.length === 0 ? "agent" : capabilities.has("ask") ? "ask-only" : "ineligible",
        missing,
    };
}