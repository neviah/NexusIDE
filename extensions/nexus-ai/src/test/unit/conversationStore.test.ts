import assert from "node:assert/strict";
import test from "node:test";
import { ConversationStorage, ConversationStore, ConversationTurn } from "../../conversationStore";

test("conversation history is bounded and restored in order", async () => {
    let state: unknown = [];
    const storage: ConversationStorage = {
        get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
        update: async (_key: string, value: unknown) => { state = value; },
    };
    const store = new ConversationStore(storage, 2);
    await store.append(turn("one"));
    await store.append(turn("two"));
    await store.append(turn("three"));
    assert.deepEqual(store.load().map((item) => item.prompt), ["two", "three"]);
});

test("malformed persisted values are discarded", () => {
    const storage: ConversationStorage = {
        get: <T>() => [{ prompt: "missing fields" }, null] as T,
        update: async () => undefined,
    };
    assert.deepEqual(new ConversationStore(storage).load(), []);
});

test("replace and clear support conversation controls", async () => {
    let state: unknown = [turn("one"), turn("two")];
    const storage: ConversationStorage = {
        get: <T>() => state as T,
        update: async (_key: string, value: unknown) => { state = value; },
    };
    const store = new ConversationStore(storage);
    await store.replaceLast(turn("regenerated"));
    assert.deepEqual(store.load().map((item) => item.prompt), ["one", "regenerated"]);
    await store.clear();
    assert.deepEqual(store.load(), []);
});

test("conversations can be created, listed, and switched", async () => {
    let state: unknown = [];
    const storage: ConversationStorage = {
        get: <T>() => state as T,
        update: async (_key: string, value: unknown) => { state = value; },
    };
    const store = new ConversationStore(storage);
    await store.append(turn("first conversation"));
    const firstId = store.activeId();
    const secondId = await store.create();
    await store.append(turn("second conversation"));
    assert.deepEqual(store.list().map(({ title }) => title), ["second conversation", "first conversation"]);
    assert.equal(await store.select(firstId), true);
    assert.equal(store.load()[0].prompt, "first conversation");
    assert.equal(await store.select("missing"), false);
    assert.notEqual(firstId, secondId);
});

function turn(prompt: string): ConversationTurn {
    return { prompt, response: `${prompt} response`, mode: "ask", harness: "OpenCode", model: "auto", route: "ollama / model" };
}