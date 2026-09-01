import assert from "node:assert/strict";
import test from "node:test";
import {
    ModelDescriptor,
    NexusError,
    ProviderAdapter,
    ProviderManifest,
    ProviderRegistry,
    ProviderStreamEvent,
    SecretStore,
} from "@nexus/ai-core";
import { ReadOnlyChatRuntime } from "../../readOnlyChatRuntime";

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