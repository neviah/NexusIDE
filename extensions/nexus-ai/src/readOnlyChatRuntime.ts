import {
    CompletionRouter,
    NexusError,
    normalizeError,
    ProviderRegistry,
    ProviderHealth,
    RouteCandidate,
    RoutedCompletionEvent,
    SecretStore,
} from "@nexus/ai-core";
import { RouteStackStore } from "./routeStackStore";
import { ContextAttachment, formatContext } from "./workspaceContextTypes";
import { ProviderStateStore } from "./providerStateStore";

export type ReadOnlyMode = "ask" | "design";
export type ModelSelection = "auto" | "ollama" | "openrouter" | "groq";

export interface ReadOnlyChatRequest {
    runId: string;
    prompt: string;
    mode: ReadOnlyMode;
    modelSelection: ModelSelection;
    context?: readonly ContextAttachment[];
    onProgress?: (message: string) => PromiseLike<void> | void;
}

export class ReadOnlyChatRuntime {
    public constructor(
        private readonly providers: ProviderRegistry,
        private readonly secretStore: SecretStore,
        private readonly routeStack?: RouteStackStore,
        private readonly router = new CompletionRouter(),
        private readonly providerState?: ProviderStateStore,
    ) {}

    public providerNames(): readonly string[] {
        return this.providers.list().map((adapter) => adapter.manifest().displayName);
    }

    public async *stream(request: ReadOnlyChatRequest, signal: AbortSignal): AsyncGenerator<RoutedCompletionEvent> {
        const candidates = await this.discoverCandidates(request, signal);
        yield* this.router.stream({
            runId: request.runId,
            candidates,
            messages: [
                { role: "system", content: systemInstruction(request.mode) },
                { role: "user", content: request.context?.length ? `${request.prompt}\n\nWorkspace context:\n${formatContext(request.context)}` : request.prompt },
            ],
            temperature: 0.2,
        }, signal);
    }

    private async discoverCandidates(request: ReadOnlyChatRequest, signal: AbortSignal): Promise<RouteCandidate[]> {
        const candidates: RouteCandidate[] = [];
        let firstFailure: NexusError | undefined;
        const selection = request.modelSelection;

        for (const adapter of this.providers.list()) {
            const providerId = adapter.manifest().id;
            if (selection !== "auto" && providerId !== selection) {
                continue;
            }
            if (this.providerState?.provider(providerId).enabled === false) {
                continue;
            }
            try {
                await requestProgress(request, `Checking ${adapter.manifest().displayName}...`);
                const authentication = await adapter.authenticate(this.secretStore);
                if (!authentication.authenticated) {
                    await requestProgress(request, `${adapter.manifest().displayName} is not configured; continuing.`);
                    continue;
                }
                const health = await this.resolveHealth(adapter, signal);
                if (health.status === "unavailable") {
                    await requestProgress(request, `${adapter.manifest().displayName} is unavailable; continuing.`);
                    continue;
                }
                await requestProgress(request, `Discovering eligible ${adapter.manifest().displayName} models...`);
                const models = await adapter.listModels(signal);
                const stack = selection === "auto" ? this.routeStack?.load() ?? [] : [];
                candidates.push(...models.flatMap((model) => {
                    const route = `${providerId}/${model.id}`;
                    const stackIndex = stack.indexOf(route);
                    if (stack.length > 0 && stackIndex < 0) {
                        return [];
                    }
                    const runtime = this.providerState?.route(providerId, model.id);
                    return [{
                        adapter,
                        model,
                        health: health.status,
                        quota: runtime?.quota,
                        cooldownUntil: runtime?.cooldownUntil,
                        priority: stackIndex < 0 ? model.costClass === "free-tier" ? 2_000 : 0 : 1_000_000 - stackIndex * 10_000,
                    }];
                }));
            } catch (error) {
                const normalized = normalizeError(error, adapter.manifest().id);
                if (normalized.code === "aborted") {
                    throw normalized;
                }
                firstFailure ??= normalized;
            }
        }

        if (candidates.length === 0 && firstFailure) {
            throw firstFailure;
        }
        if (candidates.length === 0) {
            throw new NexusError({
                code: "no-routes",
                message: selection === "auto"
                    ? "No configured local or free-tier model is available."
                    : `${providerLabel(selection)} has no configured free model available.`,
            });
        }
        return candidates;
    }

    private async resolveHealth(adapter: ReturnType<ProviderRegistry["list"]>[number], signal: AbortSignal): Promise<ProviderHealth> {
        const providerId = adapter.manifest().id;
        const cached = this.providerState?.provider(providerId).health;
        if (cached && Date.now() - Date.parse(cached.checkedAt) < 30_000) {
            return cached;
        }
        const health = await adapter.health(signal);
        await this.providerState?.recordHealth(providerId, health);
        return health;
    }
}

function systemInstruction(mode: ReadOnlyMode): string {
    if (mode === "design") {
        return "You are NexusIDE Design mode. Analyze the request, state important assumptions, and return a practical phased implementation plan. Do not claim to edit files, run commands, or perform actions.";
    }
    return "You are NexusIDE Ask mode. Answer coding and workspace questions clearly and accurately. Do not claim to edit files, run commands, or perform actions.";
}

function providerLabel(selection: Exclude<ModelSelection, "auto">): string {
    return selection === "openrouter" ? "OpenRouter" : selection === "groq" ? "Groq" : "Ollama";
}

async function requestProgress(request: ReadOnlyChatRequest, message: string): Promise<void> {
    await request.onProgress?.(message);
}