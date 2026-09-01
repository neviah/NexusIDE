import {
    CompletionRouter,
    NexusError,
    normalizeError,
    ProviderRegistry,
    RouteCandidate,
    RoutedCompletionEvent,
    SecretStore,
} from "@nexus/ai-core";

export type ReadOnlyMode = "ask" | "design";
export type ModelSelection = "auto" | "ollama";

export interface ReadOnlyChatRequest {
    runId: string;
    prompt: string;
    mode: ReadOnlyMode;
    modelSelection: ModelSelection;
}

export class ReadOnlyChatRuntime {
    public constructor(
        private readonly providers: ProviderRegistry,
        private readonly secretStore: SecretStore,
        private readonly router = new CompletionRouter(),
    ) {}

    public providerNames(): readonly string[] {
        return this.providers.list().map((adapter) => adapter.manifest().displayName);
    }

    public async *stream(request: ReadOnlyChatRequest, signal: AbortSignal): AsyncGenerator<RoutedCompletionEvent> {
        const candidates = await this.discoverCandidates(request.modelSelection, signal);
        yield* this.router.stream({
            runId: request.runId,
            candidates,
            messages: [
                { role: "system", content: systemInstruction(request.mode) },
                { role: "user", content: request.prompt },
            ],
            temperature: 0.2,
        }, signal);
    }

    private async discoverCandidates(selection: ModelSelection, signal: AbortSignal): Promise<RouteCandidate[]> {
        const candidates: RouteCandidate[] = [];
        let firstFailure: NexusError | undefined;

        for (const adapter of this.providers.list()) {
            if (selection === "ollama" && adapter.manifest().id !== "ollama") {
                continue;
            }
            try {
                const authentication = await adapter.authenticate(this.secretStore);
                if (!authentication.authenticated) {
                    continue;
                }
                const models = await adapter.listModels(signal);
                candidates.push(...models.map((model) => ({ adapter, model, health: "healthy" as const })));
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
                message: selection === "ollama"
                    ? "Ollama has no installed models available."
                    : "No configured local or free-tier model is available.",
            });
        }
        return candidates;
    }
}

function systemInstruction(mode: ReadOnlyMode): string {
    if (mode === "design") {
        return "You are NexusIDE Design mode. Analyze the request, state important assumptions, and return a practical phased implementation plan. Do not claim to edit files, run commands, or perform actions.";
    }
    return "You are NexusIDE Ask mode. Answer coding and workspace questions clearly and accurately. Do not claim to edit files, run commands, or perform actions.";
}