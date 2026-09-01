import assert from "node:assert/strict";
import test from "node:test";
import {
    CompletionRouter,
    ModelDescriptor,
    NexusError,
    ProviderAdapter,
    ProviderManifest,
    ProviderRegistry,
    ProviderStreamEvent,
    SecretStore,
} from "@nexus/ai-core";
import { ReadOnlyChatRuntime } from "../../readOnlyChatRuntime";
import { RouteStackStore } from "../../routeStackStore";
import { ProviderStateStore } from "../../providerStateStore";

const secretStore: SecretStore = {
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
};

test("Ask and Design use discovered local models before cloud free-tier models", async () => {
    const requests: string[][] = [];
    const registry = new ProviderRegistry();
    registry.register(adapter("cloud", "free-tier", requests));
    registry.register(adapter("ollama", "local", requests));
    const runtime = new ReadOnlyChatRuntime(registry, secretStore);

    const events = await collect(runtime.stream({
        runId: "run-1",
        prompt: "Plan this change",
        mode: "design",
        modelSelection: "auto",
    }, new AbortController().signal));

    const attempt = events.find((event) => event.type === "route-attempt");
    assert.deepEqual(attempt, { type: "route-attempt", runId: "run-1", providerId: "ollama", modelId: "ollama-model", attempt: 1 });
    assert.equal(events.some((event) => event.type === "text-delta" && event.text === "ollama reply"), true);
    assert.match(requests[0][0], /Design mode/);
    assert.equal(requests[0][1], "Plan this change");
});

test("Ollama selection excludes cloud routes", async () => {
    const registry = new ProviderRegistry();
    registry.register(adapter("cloud", "free-tier", []));
    registry.register(adapter("ollama", "local", []));
    const runtime = new ReadOnlyChatRuntime(registry, secretStore);

    const events = await collect(runtime.stream({
        runId: "run-2",
        prompt: "Explain this",
        mode: "ask",
        modelSelection: "ollama",
    }, new AbortController().signal));

    assert.equal(events.some((event) => event.type === "route-attempt" && event.providerId === "cloud"), false);
});

test("an empty discovery result reports a structured no-routes error", async () => {
    const runtime = new ReadOnlyChatRuntime(new ProviderRegistry(), secretStore);
    await assert.rejects(
        async () => collect(runtime.stream({ runId: "run-3", prompt: "Hello", mode: "ask", modelSelection: "auto" }, new AbortController().signal)),
        (error: unknown) => error instanceof NexusError && error.code === "no-routes",
    );
});

test("configured stack order overrides local-first scoring", async () => {
    const registry = new ProviderRegistry();
    registry.register(adapter("ollama", "local", []));
    registry.register(adapter("openrouter", "free-tier", []));
    const stack = new RouteStackStore({
        get: <T>() => ["openrouter/openrouter-model", "ollama/ollama-model"] as T,
        update: async () => undefined,
    });
    const runtime = new ReadOnlyChatRuntime(registry, secretStore, stack);
    const events = await collect(runtime.stream({ runId: "run-4", prompt: "Hello", mode: "ask", modelSelection: "auto" }, new AbortController().signal));
    assert.equal(events.find((event) => event.type === "route-attempt")?.providerId, "openrouter");
});

test("disabled and cooling-down providers are excluded from discovery", async () => {
    const calls: string[][] = [];
    const registry = new ProviderRegistry();
    registry.register(adapter("disabled", "free-tier", calls));
    registry.register(adapter("cooling", "free-tier", calls));
    registry.register(adapter("ready", "free-tier", calls));
    let state: unknown;
    const providerState = new ProviderStateStore({
        get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
        update: async (_key: string, value: unknown) => { state = value; },
    });
    await providerState.configure("disabled", false);
    await providerState.recordFailure({
        providerId: "cooling",
        modelId: "cooling-model",
        code: "rate-limited",
        observedAt: new Date().toISOString(),
        cooldownUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const runtime = new ReadOnlyChatRuntime(registry, secretStore, undefined, new CompletionRouter({ maxAttemptsPerRoute: 1 }), providerState);
    const events = await collect(runtime.stream({ runId: "state", prompt: "hello", mode: "ask", modelSelection: "auto" }, new AbortController().signal));
    assert.equal(events.some((event) => event.type === "route-attempt" && event.providerId === "ready"), true);
    assert.equal(events.some((event) => event.type === "text-delta" && event.text === "ready reply"), true);
    assert.equal(calls.length, 1);
});

test("a throttled free route falls back once and is skipped on the next request", async () => {
    let state: unknown;
    let throttledCalls = 0;
    const providerState = new ProviderStateStore({
        get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
        update: async (_key: string, value: unknown) => { state = value; },
    });
    const throttled: ProviderAdapter = {
        ...adapter("throttled", "local", []),
        stream: async function* (): AsyncGenerator<ProviderStreamEvent> {
            throttledCalls += 1;
            throw new NexusError({ code: "rate-limited", message: "limited", retryable: true });
        },
    };
    const registry = new ProviderRegistry();
    registry.register(throttled);
    registry.register(adapter("fallback", "free-tier", []));
    const router = new CompletionRouter({
        maxAttemptsPerRoute: 1,
        onRouteFailure: (observation) => providerState.recordFailure(observation),
        onQuota: (observation) => providerState.recordQuota(observation),
    });
    const runtime = new ReadOnlyChatRuntime(registry, secretStore, undefined, router, providerState);

    const first = await collect(runtime.stream({ runId: "first", prompt: "hello", mode: "ask", modelSelection: "auto" }, new AbortController().signal));
    const second = await collect(runtime.stream({ runId: "second", prompt: "again", mode: "ask", modelSelection: "auto" }, new AbortController().signal));

    assert.equal(first.some((event) => event.type === "fallback" && event.toProviderId === "fallback"), true);
    assert.equal(second.some((event) => event.type === "route-attempt" && event.providerId === "throttled"), false);
    assert.equal(second.find((event) => event.type === "route-attempt")?.providerId, "fallback");
    assert.equal(throttledCalls, 1);
});

function adapter(id: string, costClass: ModelDescriptor["costClass"], requests: string[][]): ProviderAdapter {
    const model: ModelDescriptor = {
        id: `${id}-model`,
        costClass,
        supportsTools: false,
        supportsStructuredOutput: true,
        verifiedAt: new Date(0).toISOString(),
    };
    return {
        manifest: (): ProviderManifest => ({ id, displayName: id, protocol: id === "ollama" ? "ollama" : "openai-compatible", requiresAuthentication: false }),
        authenticate: async () => ({ authenticated: true }),
        listModels: async () => [model],
        health: async () => ({ status: "healthy", checkedAt: new Date(0).toISOString() }),
        stream: async function* (request): AsyncGenerator<ProviderStreamEvent> {
            requests.push(request.messages.map((message) => message.content));
            yield { type: "text-delta", text: `${id} reply` };
            yield { type: "done" };
        },
    };
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of source) {
        values.push(value);
    }
    return values;
}