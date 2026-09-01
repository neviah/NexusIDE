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