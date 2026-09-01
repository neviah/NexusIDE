import assert from "node:assert/strict";
import test from "node:test";
import { CompletionRequest, ModelDescriptor, ProviderAdapter, ProviderManifest, ProviderStreamEvent, RouteCandidate } from "../contracts";
import { NexusError, errorFromResponse, normalizeError } from "../errors";
import { OllamaAdapter } from "../ollama";
import { OpenAICompatibleAdapter, createGroqAdapter } from "../openAiCompatible";
import { redactOperationalValue, redactText } from "../redaction";
import { CompletionRouter, eligibleCandidates } from "../router";
import { sseJson } from "../streaming";
import { MALFORMED_SSE_STREAM, OLLAMA_TEXT_STREAM, OPENAI_TEXT_STREAM, pendingStream, THROTTLED_RESPONSE } from "./fixtures";

const encoder = new TextEncoder();

test("OpenAI-compatible and Ollama transports normalize streaming text", async () => {
    const openAi = createGroqAdapter({
        apiKey: async () => "test-placeholder",
        fetch: async () => responseFrom(OPENAI_TEXT_STREAM, "text/event-stream"),
    });
    const ollama = new OllamaAdapter({
        fetch: async () => responseFrom(OLLAMA_TEXT_STREAM, "application/x-ndjson"),
    });

    assert.deepEqual(await collect(openAi.stream(completion("cloud-model"), new AbortController().signal)), [
        { type: "text-delta", text: "hello" },
        { type: "done" },
    ]);
    assert.deepEqual(await collect(ollama.stream(completion("local-model"), new AbortController().signal)), [
        { type: "text-delta", text: "hello" },
        { type: "done", finishReason: "stop" },
    ]);
});

test("OpenAI-compatible and Ollama model discovery normalize into one descriptor shape", async () => {
    const cloud = new OpenAICompatibleAdapter({
        id: "cloud",
        displayName: "Cloud",
        baseUrl: "https://example.test/v1",
        costClass: "free-tier",
        fetch: async () => Response.json({ data: [{ id: "cloud-model" }] }),
        verifiedAt: () => "2026-09-01T00:00:00.000Z",
    });
    const ollama = new OllamaAdapter({
        fetch: async () => Response.json({ models: [{ name: "local-model:latest", model: "local-model:latest" }] }),
    });

    const [cloudModel] = await cloud.listModels(new AbortController().signal);
    const [localModel] = await ollama.listModels(new AbortController().signal);
    assert.deepEqual({ id: cloudModel.id, cost: cloudModel.costClass, tools: cloudModel.supportsTools }, { id: "cloud-model", cost: "free-tier", tools: true });
    assert.deepEqual({ id: localModel.id, cost: localModel.costClass, structured: localModel.supportsStructuredOutput }, { id: "local-model:latest", cost: "local", structured: true });
});

test("free-first routing retries transient failures then falls back in deterministic order", async () => {
    const calls: string[] = [];
    const local = fakeAdapter("local", async function* () {
        calls.push("local");
        throw new NexusError({ code: "rate-limited", message: "limited", retryable: true, retryAfterMs: 25 });
    });
    const cloud = fakeAdapter("cloud", async function* () {
        calls.push("cloud");
        yield { type: "text-delta", text: "ok" };
        yield { type: "done" };
    });
    const waits: number[] = [];
    const router = new CompletionRouter({ maxAttemptsPerRoute: 2, maxTotalRetryDelayMs: 100, sleep: async (milliseconds) => { waits.push(milliseconds); } });

    const events = await collect(router.stream({
        runId: "run-1",
        messages: [{ role: "user", content: "hello" }],
        candidates: [candidate(cloud, "free-tier"), candidate(local, "local")],
    }, new AbortController().signal));

    assert.deepEqual(calls, ["local", "local", "cloud"]);
    assert.deepEqual(waits, [25]);
    assert.equal(events.find((event) => event.type === "fallback")?.type, "fallback");
    assert.equal(events.at(-2)?.type, "text-delta");
});

test("paid and trial routes require exact consent", () => {
    const paid = fakeAdapter("paid", async function* () { yield { type: "done" }; });
    const free = fakeAdapter("free", async function* () { yield { type: "done" }; });
    const candidates = [candidate(paid, "paid"), candidate(free, "free-tier")];
    const base = { runId: "run", messages: [] as const, candidates };

    assert.deepEqual(eligibleCandidates(base).map((item) => item.model.id), ["free-model"]);
    assert.deepEqual(eligibleCandidates({ ...base, paidConsent: { providerId: "paid", modelId: "paid-model" }, pinnedRoute: { providerId: "paid", modelId: "paid-model" } }).map((item) => item.model.id), ["paid-model", "free-model"]);
});

test("cancellation is normalized and never falls back", async () => {
    const secondCalls: number[] = [];
    const cancelled = fakeAdapter("cancelled", async function* (_request, signal) {
        if (signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        throw new DOMException("Aborted", "AbortError");
    });
    const second = fakeAdapter("second", async function* () { secondCalls.push(1); yield { type: "done" }; });
    const router = new CompletionRouter();

    await assert.rejects(async () => collect(router.stream({ runId: "run", messages: [], candidates: [candidate(cancelled, "local"), candidate(second, "free-tier")] }, new AbortController().signal)), (error: unknown) => error instanceof NexusError && error.code === "aborted");
    assert.deepEqual(secondCalls, []);
});

test("malformed streams and HTTP errors become structured errors", async () => {
    await assert.rejects(async () => collect(sseJson(responseFrom(MALFORMED_SSE_STREAM, "text/event-stream").body, new AbortController().signal)), (error: unknown) => error instanceof NexusError && error.code === "invalid-response");

    const auth = await errorFromResponse(new Response("api_key=actual-secret", { status: 401 }), "cloud");
    const limited = await errorFromResponse(new Response(THROTTLED_RESPONSE.body, THROTTLED_RESPONSE), "cloud");
    assert.equal(auth.code, "authentication");
    assert.equal(auth.safeDetails, undefined);
    assert.equal(limited.retryAfterMs, 2_000);
    assert.equal(limited.retryable, true);
    assert.equal(normalizeError(new TypeError("network"), "cloud").code, "unavailable");
});

test("HTTP failure classes and fallback exhaustion remain normalized", async () => {
    const cases: readonly [number, NexusError["code"], boolean][] = [
        [403, "authentication", false],
        [408, "timeout", true],
        [500, "unavailable", true],
        [503, "unavailable", true],
    ];
    for (const [status, code, retryable] of cases) {
        const error = await errorFromResponse(new Response("failure", { status }), "cloud");
        assert.equal(error.code, code);
        assert.equal(error.retryable, retryable);
    }

    const failed = fakeAdapter("failed", async function* () {
        throw new NexusError({ code: "unavailable", message: "offline", retryable: false });
    });
    const router = new CompletionRouter({ maxAttemptsPerRoute: 1 });
    await assert.rejects(
        async () => collect(router.stream({ runId: "run", messages: [], candidates: [candidate(failed, "local")] }, new AbortController().signal)),
        (error: unknown) => error instanceof NexusError && error.code === "fallback-exhausted",
    );
});

test("aborting a pending stream read cancels promptly", async () => {
    const controller = new AbortController();
    const reading = collect(sseJson(pendingStream(), controller.signal));
    controller.abort();
    await assert.rejects(reading, (error: unknown) => error instanceof NexusError && error.code === "aborted");
});

test("operational redaction removes credentials and prompt content", () => {
    const secret = "sk-test-placeholder";
    const text = redactText(`Bearer ${secret} https://host.test?api_key=${secret}`, [secret]);
    assert.doesNotMatch(text, /sk-test-placeholder/);
    assert.deepEqual(redactOperationalValue({ provider: "groq", messages: [{ content: "private source" }], authorization: `Bearer ${secret}` }, [secret]), {
        provider: "groq",
        messages: "[REDACTED]",
        authorization: "[REDACTED]",
    });
});

test("Groq adapter uses the normalized cloud contract", () => {
    const adapter = createGroqAdapter({ apiKey: async () => "test-placeholder", fetch: async () => new Response() });
    assert.deepEqual(adapter.manifest(), { id: "groq", displayName: "Groq", protocol: "openai-compatible", requiresAuthentication: true });
});

function completion(model: string): CompletionRequest {
    return { model, messages: [{ role: "user", content: "hello" }] };
}

function responseFrom(chunks: readonly string[], contentType: string): Response {
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    }), { status: 200, headers: { "content-type": contentType } });
}

function fakeAdapter(id: string, stream: ProviderAdapter["stream"]): ProviderAdapter {
    return {
        manifest: (): ProviderManifest => ({ id, displayName: id, protocol: "openai-compatible", requiresAuthentication: false }),
        authenticate: async () => ({ authenticated: true }),
        listModels: async () => [],
        health: async () => ({ status: "healthy", checkedAt: new Date(0).toISOString() }),
        stream,
    };
}

function candidate(adapter: ProviderAdapter, costClass: ModelDescriptor["costClass"]): RouteCandidate {
    return {
        adapter,
        model: {
            id: `${adapter.manifest().id}-model`,
            costClass,
            supportsTools: true,
            supportsStructuredOutput: true,
            verifiedAt: new Date(0).toISOString(),
        },
        health: "healthy",
    };
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of source) {
        values.push(value);
    }
    return values;
}