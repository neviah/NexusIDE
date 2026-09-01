import { AuthStatus, CompletionRequest, ModelDescriptor, ProviderAdapter, ProviderHealth, ProviderManifest, ProviderStreamEvent, SecretStore } from "./contracts";
import { NexusError, errorFromResponse, normalizeError } from "./errors";
import { jsonLines } from "./streaming";

export interface OllamaOptions {
    baseUrl?: string;
    fetch?: typeof fetch;
}

interface OllamaStreamChunk {
    message?: { content?: string };
    done?: boolean;
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
    error?: string;
}

export class OllamaAdapter implements ProviderAdapter {
    private readonly baseUrl: string;
    private readonly request: typeof fetch;

    public constructor(options: OllamaOptions = {}) {
        this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
        this.request = options.fetch ?? globalThis.fetch;
    }

    public manifest(): ProviderManifest {
        return { id: "ollama", displayName: "Ollama", protocol: "ollama", requiresAuthentication: false };
    }

    public async authenticate(_secretStore: SecretStore): Promise<AuthStatus> {
        return { authenticated: true };
    }

    public async listModels(signal: AbortSignal): Promise<readonly ModelDescriptor[]> {
        const response = await this.fetch("/api/tags", { method: "GET", signal });
        let payload: { models?: Array<{ name?: string; model?: string }> };
        try {
            payload = await response.json() as typeof payload;
        } catch (error) {
            throw new NexusError({ code: "invalid-response", message: "Ollama returned malformed model JSON.", providerId: "ollama", cause: error });
        }
        return (payload.models ?? []).flatMap((model) => {
            const id = model.model ?? model.name;
            return id ? [{ id, displayName: model.name, costClass: "local" as const, supportsTools: false, supportsStructuredOutput: true, verifiedAt: new Date().toISOString() }] : [];
        });
    }

    public async health(signal: AbortSignal): Promise<ProviderHealth> {
        const started = Date.now();
        try {
            await this.fetch("/api/tags", { method: "GET", signal });
            return { status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
        } catch (error) {
            return { status: "unavailable", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message: normalizeError(error, "ollama").message };
        }
    }

    public async *stream(request: CompletionRequest, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent> {
        const response = await this.fetch("/api/chat", {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                stream: true,
                format: request.structuredOutput,
                options: { temperature: request.temperature, num_predict: request.maxOutputTokens },
            }),
        });
        for await (const chunk of jsonLines<OllamaStreamChunk>(response.body, signal)) {
            if (chunk.error) {
                throw new NexusError({ code: "invalid-response", message: "Ollama reported a streaming error.", providerId: "ollama" });
            }
            if (chunk.message?.content) {
                yield { type: "text-delta", text: chunk.message.content };
            }
            if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) {
                yield { type: "usage", inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count };
            }
            if (chunk.done) {
                yield { type: "done", finishReason: chunk.done_reason };
            }
        }
    }

    private async fetch(path: string, init: RequestInit): Promise<Response> {
        try {
            const response = await this.request(`${this.baseUrl}${path}`, init);
            if (!response.ok) {
                throw await errorFromResponse(response, "ollama");
            }
            return response;
        } catch (error) {
            throw normalizeError(error, "ollama");
        }
    }
}