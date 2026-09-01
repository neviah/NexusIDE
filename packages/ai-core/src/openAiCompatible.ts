import { AuthStatus, CompletionRequest, CostClass, ModelDescriptor, ProviderAdapter, ProviderHealth, ProviderManifest, ProviderQuota, ProviderStreamEvent, SecretStore } from "./contracts";
import { NexusError, errorFromResponse, normalizeError } from "./errors";
import { sseJson } from "./streaming";

export interface OpenAICompatibleOptions {
    id: string;
    displayName: string;
    baseUrl: string | (() => string);
    costClass: CostClass;
    apiKey?: () => Promise<string | undefined>;
    authenticationRequired?: boolean;
    fetch?: typeof fetch;
    supportsTools?: boolean;
    supportsStructuredOutput?: boolean;
    headers?: Readonly<Record<string, string>>;
    verifiedAt?: () => string;
    mapModel?: (model: OpenAICompatibleModel) => ModelDescriptor | undefined;
}

export interface OpenAICompatibleModel {
    id?: string;
    name?: string;
    context_length?: number;
    supported_parameters?: string[];
    pricing?: {
        prompt?: string;
        completion?: string;
        request?: string;
    };
}

interface OpenAIChunk {
    choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
    private readonly request: typeof fetch;

    public constructor(private readonly options: OpenAICompatibleOptions) {
        this.request = options.fetch ?? globalThis.fetch;
    }

    public manifest(): ProviderManifest {
        return { id: this.options.id, displayName: this.options.displayName, protocol: "openai-compatible", requiresAuthentication: this.options.authenticationRequired ?? Boolean(this.options.apiKey) };
    }

    public async authenticate(_secretStore: SecretStore): Promise<AuthStatus> {
        if (!this.options.apiKey || !this.options.authenticationRequired) {
            return { authenticated: true };
        }
        return { authenticated: Boolean(await this.options.apiKey()), message: "Configure this provider's API key in NexusIDE SecretStorage." };
    }

    public async listModels(signal: AbortSignal): Promise<readonly ModelDescriptor[]> {
        const response = await this.fetch("models", { method: "GET", signal });
        const payload = await parseJson<{ data?: OpenAICompatibleModel[] }>(response, this.options.id);
        return (payload.data ?? []).flatMap((model) => {
            if (this.options.mapModel) {
                const descriptor = this.options.mapModel(model);
                return descriptor ? [descriptor] : [];
            }
            return model.id ? [{
            id: model.id,
            costClass: this.options.costClass,
            supportsTools: this.options.supportsTools ?? true,
            supportsStructuredOutput: this.options.supportsStructuredOutput ?? true,
            verifiedAt: this.options.verifiedAt?.() ?? new Date().toISOString(),
            }] : [];
        });
    }

    public async health(signal: AbortSignal): Promise<ProviderHealth> {
        const started = Date.now();
        try {
            await this.fetch("models", { method: "GET", signal });
            return { status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
        } catch (error) {
            const normalized = normalizeError(error, this.options.id);
            return { status: normalized.code === "authentication" ? "degraded" : "unavailable", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: normalized.message };
        }
    }

    public async *stream(request: CompletionRequest, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent> {
        const response = await this.fetch("chat/completions", {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: request.maxOutputTokens,
                temperature: request.temperature,
                response_format: request.structuredOutput ? { type: "json_schema", json_schema: request.structuredOutput } : undefined,
            }),
        });
        const quota = parseProviderQuota(response.headers);
        if (quota) {
            yield { type: "quota", quota };
        }

        let completed = false;
        for await (const chunk of sseJson<OpenAIChunk>(response.body, signal)) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
                yield { type: "text-delta", text };
            }
            if (chunk.usage) {
                yield { type: "usage", inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
            }
            const finishReason = chunk.choices?.[0]?.finish_reason;
            if (finishReason) {
                completed = true;
                yield { type: "done", finishReason };
            }
        }
        if (!completed) {
            yield { type: "done" };
        }
    }

    private async fetch(path: string, init: RequestInit): Promise<Response> {
        try {
            const apiKey = await this.options.apiKey?.();
            const baseUrl = typeof this.options.baseUrl === "function" ? this.options.baseUrl() : this.options.baseUrl;
            const response = await this.request(`${baseUrl.replace(/\/$/, "")}/${path}`, {
                ...init,
                headers: {
                    ...this.options.headers,
                    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
                    ...init.headers,
                },
            });
            if (!response.ok) {
                throw await errorFromResponse(response, this.options.id);
            }
            return response;
        } catch (error) {
            throw normalizeError(error, this.options.id);
        }
    }
}

async function parseJson<T>(response: Response, providerId: string): Promise<T> {
    try {
        return await response.json() as T;
    } catch (error) {
        throw new NexusError({ code: "invalid-response", message: `${providerId} returned malformed JSON.`, providerId, cause: error });
    }
}

export function createGroqAdapter(options: Pick<OpenAICompatibleOptions, "apiKey" | "fetch">): OpenAICompatibleAdapter {
    return new OpenAICompatibleAdapter({
        id: "groq",
        displayName: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        costClass: "free-tier",
        supportsTools: true,
        supportsStructuredOutput: true,
        ...options,
    });
}

export function createOpenRouterAdapter(options: Pick<OpenAICompatibleOptions, "apiKey" | "fetch" | "verifiedAt">): OpenAICompatibleAdapter {
    const verifiedAt = options.verifiedAt ?? (() => new Date().toISOString());
    return new OpenAICompatibleAdapter({
        id: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        costClass: "mixed",
        supportsTools: true,
        supportsStructuredOutput: true,
        headers: {
            "HTTP-Referer": "https://github.com/neviah/NexusIDE",
            "X-OpenRouter-Title": "NexusIDE",
        },
        ...options,
        mapModel: (model) => isVerifiedFreeOpenRouterModel(model) && model.id ? {
            id: model.id,
            displayName: model.name,
            costClass: "free-tier",
            contextTokens: model.context_length,
            supportsTools: model.supported_parameters?.includes("tools") ?? false,
            supportsStructuredOutput: model.supported_parameters?.some((parameter) => parameter === "structured_outputs" || parameter === "response_format") ?? false,
            verifiedAt: verifiedAt(),
        } : undefined,
    });
}

function isVerifiedFreeOpenRouterModel(model: OpenAICompatibleModel): boolean {
    const pricing = model.pricing;
    return pricing !== undefined
        && isZeroPrice(pricing.prompt)
        && isZeroPrice(pricing.completion)
        && isZeroPrice(pricing.request ?? "0");
}

function isZeroPrice(value: string | undefined): boolean {
    return value !== undefined && value.trim() !== "" && Number(value) === 0;
}

export interface CustomOpenAICompatibleOptions extends Pick<OpenAICompatibleOptions, "apiKey" | "fetch" | "supportsTools" | "supportsStructuredOutput"> {
    baseUrl: string | (() => string);
    displayName?: string;
    costClass?: "local" | "free-tier";
}

export function createCustomOpenAICompatibleAdapter(options: CustomOpenAICompatibleOptions): OpenAICompatibleAdapter {
    return new OpenAICompatibleAdapter({
        id: "custom-openai",
        displayName: options.displayName?.trim() || "Custom OpenAI-Compatible",
        baseUrl: options.baseUrl,
        costClass: options.costClass ?? "local",
        authenticationRequired: false,
        supportsTools: options.supportsTools ?? true,
        supportsStructuredOutput: options.supportsStructuredOutput ?? true,
        apiKey: options.apiKey,
        fetch: options.fetch,
    });
}

export function parseProviderQuota(headers: Headers, now = Date.now()): ProviderQuota | undefined {
    const remaining = firstNumber(headers, ["x-ratelimit-remaining-requests", "x-ratelimit-remaining"]);
    const limit = firstNumber(headers, ["x-ratelimit-limit-requests", "x-ratelimit-limit"]);
    const resetValue = firstHeader(headers, ["x-ratelimit-reset-requests", "x-ratelimit-reset"]);
    if (remaining === undefined && limit === undefined && !resetValue) return undefined;
    const resetsAt = resetValue ? parseReset(resetValue, now) : undefined;
    const ratio = remaining !== undefined && limit !== undefined && limit > 0 ? remaining / limit : undefined;
    return {
        status: remaining !== undefined && remaining <= 0 ? "exhausted" : ratio !== undefined && ratio <= 0.2 ? "limited" : remaining !== undefined ? "available" : "unknown",
        observedAt: new Date(now).toISOString(),
        remaining,
        limit,
        resetsAt,
    };
}

function firstHeader(headers: Headers, names: readonly string[]): string | undefined {
    return names.map((name) => headers.get(name)?.trim()).find((value): value is string => Boolean(value));
}

function firstNumber(headers: Headers, names: readonly string[]): number | undefined {
    const value = firstHeader(headers, names);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseReset(value: string, now: number): string | undefined {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
        const timestamp = numeric >= 1_000_000_000_000 ? numeric : numeric >= 1_000_000_000 ? numeric * 1_000 : now + numeric * 1_000;
        const date = new Date(timestamp);
        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    const absolute = Date.parse(value);
    if (!Number.isNaN(absolute)) return new Date(absolute).toISOString();
    let milliseconds = 0;
    let matched = false;
    for (const match of value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/gi)) {
        matched = true;
        const amount = Number(match[1]);
        milliseconds += amount * (match[2].toLowerCase() === "h" ? 3_600_000 : match[2].toLowerCase() === "m" ? 60_000 : match[2].toLowerCase() === "s" ? 1_000 : 1);
    }
    return matched ? new Date(now + milliseconds).toISOString() : undefined;
}