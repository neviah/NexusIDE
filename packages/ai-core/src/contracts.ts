export type CostClass = "local" | "free-tier" | "trial" | "mixed" | "paid";

export type ProviderProtocol = "ollama" | "openai-compatible";

export interface SecretStore {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface ProviderManifest {
    id: string;
    displayName: string;
    protocol: ProviderProtocol;
    requiresAuthentication: boolean;
}

export interface AuthStatus {
    authenticated: boolean;
    message?: string;
}

export interface ProviderHealth {
    status: "healthy" | "degraded" | "unavailable" | "unknown";
    checkedAt: string;
    latencyMs?: number;
    message?: string;
}

export interface ModelDescriptor {
    id: string;
    displayName?: string;
    costClass: CostClass;
    contextTokens?: number;
    supportsTools: boolean;
    supportsStructuredOutput: boolean;
    codingScore?: number;
    verifiedAt: string;
}

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
}

export interface CompletionRequest {
    model: string;
    messages: readonly ChatMessage[];
    maxOutputTokens?: number;
    temperature?: number;
    structuredOutput?: Readonly<Record<string, unknown>>;
}

export type ProviderStreamEvent =
    | { type: "text-delta"; text: string }
    | { type: "usage"; inputTokens?: number; outputTokens?: number }
    | { type: "done"; finishReason?: string };

export interface ProviderAdapter {
    manifest(): ProviderManifest;
    authenticate(secretStore: SecretStore): Promise<AuthStatus>;
    listModels(signal: AbortSignal): Promise<readonly ModelDescriptor[]>;
    health(signal: AbortSignal): Promise<ProviderHealth>;
    stream(request: CompletionRequest, signal: AbortSignal): AsyncIterable<ProviderStreamEvent>;
}

export interface RouteCandidate {
    adapter: ProviderAdapter;
    model: ModelDescriptor;
    enabled?: boolean;
    priority?: number;
    health?: ProviderHealth["status"];
}

export interface PaidRouteConsent {
    providerId: string;
    modelId: string;
}

export interface RouteRequirements {
    tools?: boolean;
    structuredOutput?: boolean;
    estimatedInputTokens?: number;
}

export interface RoutedCompletionRequest extends Omit<CompletionRequest, "model"> {
    runId: string;
    candidates: readonly RouteCandidate[];
    requirements?: RouteRequirements;
    pinnedRoute?: { providerId: string; modelId: string };
    paidConsent?: PaidRouteConsent;
}

export type RoutedCompletionEvent =
    | ProviderStreamEvent
    | { type: "route-attempt"; runId: string; providerId: string; modelId: string; attempt: number }
    | { type: "fallback"; runId: string; fromProviderId: string; fromModelId: string; toProviderId: string; toModelId: string; reason: string };