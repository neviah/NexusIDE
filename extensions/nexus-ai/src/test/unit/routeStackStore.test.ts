import assert from "node:assert/strict";
import test from "node:test";
import { RouteStackStorage, RouteStackStore } from "../../routeStackStore";

test("route stack preserves order and removes duplicates", async () => {
    let state: unknown = [];
    const storage: RouteStackStorage = {
        get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
        update: async (_key: string, value: unknown) => { state = value; },
    };
    const store = new RouteStackStore(storage);
    await store.save(["ollama/a", "openrouter/b", "ollama/a"]);
    assert.deepEqual(store.load(), ["ollama/a", "openrouter/b"]);
});

test("route stack notifies dashboards after a saved change", async () => {
    let notified = 0;
    const store = new RouteStackStore({
        get: <T>(_key: string, fallback: T) => fallback,
        update: async () => undefined,
    });
    const subscription = store.onDidChange(() => { notified += 1; });
    await store.save(["groq/model"]);
    assert.equal(notified, 1);
    subscription.dispose();
    await store.save([]);
    assert.equal(notified, 1);
});