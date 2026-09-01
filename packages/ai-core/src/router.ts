import { RouteCandidate, RoutedCompletionEvent, RoutedCompletionRequest } from "./contracts";
import { NexusError, normalizeError } from "./errors";

export interface CompletionRouterOptions {
    maxAttemptsPerRoute?: number;
    maxTotalRetryDelayMs?: number;
    sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export class CompletionRouter {
    private readonly maxAttemptsPerRoute: number;
    private readonly maxTotalRetryDelayMs: number;
    private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;

    public constructor(options: CompletionRouterOptions = {}) {
        this.maxAttemptsPerRoute = Math.max(1, options.maxAttemptsPerRoute ?? 2);
        this.maxTotalRetryDelayMs = Math.max(0, options.maxTotalRetryDelayMs ?? 5_000);
        this.sleep = options.sleep ?? abortableSleep;
    }

    public async *stream(request: RoutedCompletionRequest, signal: AbortSignal): AsyncGenerator<RoutedCompletionEvent> {
        const candidates = eligibleCandidates(request);
        if (candidates.length === 0) {
            throw new NexusError({ code: "no-routes", message: "No eligible no-cost route is available." });
        }

        let totalRetryDelay = 0;
        let lastError: NexusError | undefined;
        for (let routeIndex = 0; routeIndex < candidates.length; routeIndex += 1) {
            const candidate = candidates[routeIndex];
            const providerId = candidate.adapter.manifest().id;

            for (let attempt = 1; attempt <= this.maxAttemptsPerRoute; attempt += 1) {
                yield { type: "route-attempt", runId: request.runId, providerId, modelId: candidate.model.id, attempt };
                let emittedContent = false;
                try {
                    for await (const event of candidate.adapter.stream({
                        model: candidate.model.id,
                        messages: request.messages,
                        maxOutputTokens: request.maxOutputTokens,
                        temperature: request.temperature,
                        structuredOutput: request.structuredOutput,
                    }, signal)) {
                        emittedContent ||= event.type === "text-delta";
                        yield event;
                    }
                    return;
                } catch (error) {
                    lastError = normalizeError(error, providerId);
                    if (lastError.code === "aborted" || emittedContent) {
                        throw lastError;
                    }

                    const requestedDelay = lastError.retryAfterMs ?? 0;
                    const canRetry = lastError.retryable
                        && attempt < this.maxAttemptsPerRoute
                        && totalRetryDelay + requestedDelay <= this.maxTotalRetryDelayMs;
                    if (canRetry) {
                        totalRetryDelay += requestedDelay;
                        try {
                            await this.sleep(requestedDelay, signal);
                        } catch (error) {
                            throw normalizeError(error, providerId);
                        }
                        continue;
                    }
                    break;
                }
            }

            const next = candidates[routeIndex + 1];
            if (next && lastError) {
                yield {
                    type: "fallback",
                    runId: request.runId,
                    fromProviderId: providerId,
                    fromModelId: candidate.model.id,
                    toProviderId: next.adapter.manifest().id,
                    toModelId: next.model.id,
                    reason: lastError.code,
                };
            }
        }

        throw new NexusError({ code: "fallback-exhausted", message: "Every eligible no-cost route failed.", cause: lastError });
    }
}

export function eligibleCandidates(request: RoutedCompletionRequest): RouteCandidate[] {
    return request.candidates
        .filter((candidate) => candidate.enabled !== false)
        .filter((candidate) => isCostAllowed(candidate, request))
        .filter((candidate) => candidate.health !== "unavailable")
        .filter((candidate) => !request.requirements?.tools || candidate.model.supportsTools)
        .filter((candidate) => !request.requirements?.structuredOutput || candidate.model.supportsStructuredOutput)
        .filter((candidate) => !request.requirements?.estimatedInputTokens || !candidate.model.contextTokens || request.requirements.estimatedInputTokens <= candidate.model.contextTokens)
        .map((candidate, index) => ({ candidate, index, score: routeScore(candidate, request) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(({ candidate }) => candidate);
}

function isCostAllowed(candidate: RouteCandidate, request: RoutedCompletionRequest): boolean {
    if (candidate.model.costClass === "local" || candidate.model.costClass === "free-tier") {
        return true;
    }
    const providerId = candidate.adapter.manifest().id;
    return request.paidConsent?.providerId === providerId && request.paidConsent.modelId === candidate.model.id;
}

function routeScore(candidate: RouteCandidate, request: RoutedCompletionRequest): number {
    const providerId = candidate.adapter.manifest().id;
    const pinned = request.pinnedRoute?.providerId === providerId && request.pinnedRoute.modelId === candidate.model.id;
    const cost = candidate.model.costClass === "local" ? 2_000 : candidate.model.costClass === "free-tier" ? 1_000 : 0;
    const health = candidate.health === "healthy" ? 100 : candidate.health === "degraded" ? -100 : 0;
    const context = Math.min(candidate.model.contextTokens ?? 0, 1_000_000) / 100_000;
    return (pinned ? 10_000 : 0) + cost + health + (candidate.model.codingScore ?? 0) * 10 + context + (candidate.priority ?? 0);
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
    });
}