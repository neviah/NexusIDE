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

function turn(prompt: string): ConversationTurn {
    return { prompt, response: `${prompt} response`, mode: "ask", harness: "OpenCode", model: "auto", route: "ollama / model" };
}