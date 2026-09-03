import assert from "node:assert/strict";
import test from "node:test";
import { ProviderStateStorage, ProviderStateStore } from "../../providerStateStore";

test("provider settings default enabled and persist disablement plus quota notes", async () => {
    const { storage, value } = memoryStorage();
    const store = new ProviderStateStore(storage);
    assert.deepEqual(store.provider("groq"), { enabled: true, quotaNote: undefined, health: undefined });
    await store.configure("groq", false, "Account free-tier quota");
    assert.equal(store.provider("groq").enabled, false);
    assert.equal(store.provider("groq").quotaNote, "Account free-tier quota");
    assert.equal(typeof value(), "object");
});

test("rate limits persist a route cooldown and expire at read time", async () => {
    const { storage } = memoryStorage();
    const store = new ProviderStateStore(storage);
    await store.recordFailure({
        providerId: "groq",
        modelId: "model",
        code: "rate-limited",
        observedAt: "2026-09-01T00:00:00.000Z",
        cooldownUntil: "2026-09-01T00:01:00.000Z",
    });
    assert.equal(store.route("groq", "model", Date.parse("2026-09-01T00:00:30.000Z")).cooldownUntil, "2026-09-01T00:01:00.000Z");
    assert.equal(store.route("groq", "model", Date.parse("2026-09-01T00:01:01.000Z")).cooldownUntil, undefined);
    assert.equal(store.route("groq", "model", Date.parse("2026-09-01T00:00:30.000Z")).quota?.status, "limited");
});

test("health and quota observations remain available to routing and UI", async () => {
    const { storage } = memoryStorage();
    const store = new ProviderStateStore(storage);
    await store.recordHealth("ollama", { status: "healthy", checkedAt: "2026-09-01T00:00:00.000Z", latencyMs: 12 });
    await store.recordQuota({ providerId: "groq", modelId: "model", quota: { status: "available", observedAt: "2026-09-01T00:00:00.000Z", remaining: 90, limit: 100 } });
    assert.equal(store.provider("ollama").health?.latencyMs, 12);
    assert.equal(store.route("groq", "model").quota?.remaining, 90);
});

test("provider smoke outcomes persist as bounded dashboard freshness", async () => {
    const { storage } = memoryStorage();
    const store = new ProviderStateStore(storage);
    await store.recordSmoke("groq", "passed", "healthy");
    assert.equal(store.provider("groq").smoke?.outcome, "passed");
    assert.equal(store.provider("groq").smoke?.message, "healthy");
});

test("exhausted quota expires after its advertised reset", async () => {
    const { storage } = memoryStorage();
    const store = new ProviderStateStore(storage);
    await store.recordQuota({ providerId: "groq", modelId: "model", quota: {
        status: "exhausted",
        observedAt: "2026-09-01T00:00:00.000Z",
        resetsAt: "2026-09-01T00:01:00.000Z",
    } });
    assert.equal(store.route("groq", "model", Date.parse("2026-09-01T00:00:30.000Z")).quota?.status, "exhausted");
    assert.equal(store.route("groq", "model", Date.parse("2026-09-01T00:01:01.000Z")).quota, undefined);
});

function memoryStorage(): { storage: ProviderStateStorage; value: () => unknown } {
    let state: unknown;
    return {
        storage: {
            get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
            update: async (_key: string, value: unknown) => { state = value; },
        },
        value: () => state,
    };
}
