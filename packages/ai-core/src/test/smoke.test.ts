import assert from "node:assert/strict";
import test from "node:test";
import {
    CATALOG_PROVIDER_DEFINITIONS,
    CompletionRequest,
    formatSmokeReport,
    ModelDescriptor,
    ProviderAdapter,
    ProviderStreamEvent,
    selectSmokeModel,
    SMOKE_ALLOWED_COST_CLASSES,
    smokeProvider,
    smokeProviders,
} from "../index";

interface FakeOptions {
    id: string;
    authenticated?: boolean;
    health?: "healthy" | "degraded" | "unavailable";
    models?: readonly Partial<ModelDescriptor>[];
    chunks?: readonly string[];
    complete?: boolean;
    failWith?: string;
}

function fakeAdapter(options: FakeOptions): { adapter: ProviderAdapter; streamed: CompletionRequest[] } {
    const streamed: CompletionRequest[] = [];
    const adapter: ProviderAdapter = {
        manifest: () => ({ id: options.id, displayName: options.id, protocol: "openai-compatible", requiresAuthentication: true }),
        authenticate: async () => ({ authenticated: options.authenticated ?? true }),
        health: async () => ({ status: options.health ?? "healthy", checkedAt: "2026-09-02T00:00:00.000Z", latencyMs: 12 }),
        listModels: async () => (options.models ?? [{ id: "free-model", costClass: "free-tier" }]).map((model) => ({
            id: "model",
            costClass: "free-tier",
            supportsTools: true,
            supportsStructuredOutput: true,
            verifiedAt: "2026-09-02T00:00:00.000Z",
            ...model,
        })) as ModelDescriptor[],
        async *stream(request: CompletionRequest): AsyncIterable<ProviderStreamEvent> {
            streamed.push(request);
            if (options.failWith) {
                throw new Error(options.failWith);
            }
            for (const text of options.chunks ?? ["ready"]) {
                yield { type: "text-delta", text };
            }
            if (options.complete ?? true) {
                yield { type: "done", finishReason: "stop" };
            }
        },
    };
    return { adapter, streamed };
}

test("a configured provider passes only after streaming real text to completion", async () => {
    const { adapter, streamed } = fakeAdapter({ id: "groq" });
    const result = await smokeProvider(adapter, { maxOutputTokens: 8 });

    assert.equal(result.outcome, "passed");
    assert.equal(result.modelId, "free-model");
    assert.deepEqual(result.checks.map(({ name, ok }) => [name, ok]), [["authenticate", true], ["health", true], ["discover", true], ["stream", true], ["complete", true]]);
    assert.equal(streamed[0].maxOutputTokens, 8);
    assert.equal(streamed[0].temperature, 0);
});

test("an unconfigured provider is skipped rather than reported as broken", async () => {
    const { adapter } = fakeAdapter({ id: "gemini", authenticated: false });
    const result = await smokeProvider(adapter);

    assert.equal(result.outcome, "skipped");
    assert.match(result.reason ?? "", /No credentials/);
});

test("providers that answer without text or without completing are failures", async () => {
    const silent = await smokeProvider(fakeAdapter({ id: "a", chunks: ["   "] }).adapter);
    assert.equal(silent.outcome, "failed");
    assert.match(silent.reason ?? "", /no text/i);

    const truncated = await smokeProvider(fakeAdapter({ id: "b", complete: false }).adapter);
    assert.equal(truncated.outcome, "failed");
    assert.match(truncated.reason ?? "", /did not complete/);
});

test("unavailable providers and thrown errors are reported without crashing the run", async () => {
    const down = await smokeProvider(fakeAdapter({ id: "c", health: "unavailable" }).adapter);
    assert.equal(down.outcome, "failed");

    const broken = await smokeProvider(fakeAdapter({ id: "d", failWith: "connection reset to 10.0.0.5" }).adapter);
    assert.equal(broken.outcome, "failed");
    // Failures are normalized, so raw transport detail never reaches the report.
    assert.equal(broken.reason, "The provider request failed.");
    assert.equal(broken.checks.at(-1)?.name, "error");
});

test("billable routes are never streamed even when a provider offers them", async () => {
    const { adapter, streamed } = fakeAdapter({ id: "mixed", models: [{ id: "paid-model", costClass: "paid" }, { id: "trial-model", costClass: "trial" }] });
    const result = await smokeProvider(adapter);

    assert.equal(result.outcome, "skipped");
    assert.match(result.reason ?? "", /No local or free-tier model/);
    assert.equal(streamed.length, 0);
});

test("model selection prefers small models and only ever returns no-cost routes", () => {
    const models = [
        { id: "huge-405b", costClass: "free-tier" },
        { id: "llama-8b-instant", costClass: "free-tier" },
        { id: "premium", costClass: "paid" },
    ].map((model) => ({ supportsTools: true, supportsStructuredOutput: true, verifiedAt: "" , ...model })) as ModelDescriptor[];

    assert.equal(selectSmokeModel(models, ["8b"])?.id, "llama-8b-instant");
    assert.equal(selectSmokeModel(models)?.id, "huge-405b");
    assert.equal(selectSmokeModel([models[2]]), undefined);
    assert.deepEqual([...SMOKE_ALLOWED_COST_CLASSES], ["local", "free-tier"]);
});

test("a run proves nothing when every provider is skipped", async () => {
    const report = await smokeProviders([fakeAdapter({ id: "x", authenticated: false }).adapter]);

    assert.equal(report.ok, false);
    assert.deepEqual([report.passed, report.failed, report.skipped], [0, 0, 1]);
    assert.match(formatSmokeReport(report), /nothing was proven/);
});

test("a mixed run aggregates outcomes and fails when any provider fails", async () => {
    const report = await smokeProviders([
        fakeAdapter({ id: "ollama" }).adapter,
        fakeAdapter({ id: "broken", failWith: "timeout" }).adapter,
        fakeAdapter({ id: "absent", authenticated: false }).adapter,
    ]);

    assert.deepEqual([report.passed, report.failed, report.skipped], [1, 1, 1]);
    assert.equal(report.ok, false);
    const formatted = formatSmokeReport(report);
    assert.match(formatted, /PASS ollama/);
    assert.match(formatted, /FAIL broken/);
    assert.match(formatted, /SKIP absent/);
});

test("catalog definitions stay the single source of truth for runtime and smoke wiring", () => {
    const ids = CATALOG_PROVIDER_DEFINITIONS.map(({ id }) => id);
    assert.deepEqual(ids, ["nvidia", "gemini", "cerebras", "mistral", "huggingface", "sambanova"]);
    assert.equal(new Set(CATALOG_PROVIDER_DEFINITIONS.map(({ environmentKey }) => environmentKey)).size, ids.length);
    assert.deepEqual(
        CATALOG_PROVIDER_DEFINITIONS.filter(({ costClass }) => costClass !== "free-tier").map(({ id }) => id),
        ["huggingface", "sambanova"],
    );
});
