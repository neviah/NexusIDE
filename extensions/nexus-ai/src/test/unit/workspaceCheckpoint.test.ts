import assert from "node:assert/strict";
import test from "node:test";
import { contentDigest, WorkspaceCheckpointStore } from "../../workspaceCheckpoint";

test("a checkpoint retains the original content across repeated Agent writes", () => {
    const store = new WorkspaceCheckpointStore();
    const id = store.begin();
    store.capture("C:/project/Assets/Game.cs", "original", "first");
    store.capture("C:/project/Assets/Game.cs", "first", "second");

    const checkpoint = store.finish(id)!;
    assert.equal(checkpoint.files.length, 1);
    assert.deepEqual(checkpoint.files[0], { path: "C:/project/Assets/Game.cs", before: "original", after: "second" });
});

test("a checkpoint distinguishes files created by an Agent and can be discarded", () => {
    const store = new WorkspaceCheckpointStore();
    const id = store.begin();
    store.capture("C:/project/Assets/New.cs", undefined, "new content");

    assert.equal(store.finish(id)?.files[0].before, undefined);
    assert.equal(store.get(id)?.files[0].after, "new content");
    store.discard(id);
    assert.equal(store.get(id), undefined);
});

test("content digests are stable and sensitive to post-run edits", () => {
    assert.equal(contentDigest("agent result"), contentDigest("agent result"));
    assert.notEqual(contentDigest("agent result"), contentDigest("user edit"));
});
