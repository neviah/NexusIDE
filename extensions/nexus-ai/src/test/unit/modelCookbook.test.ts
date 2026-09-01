import assert from "node:assert/strict";
import test from "node:test";
import { cookbookModel, recommendedModels } from "../../modelCookbook";

test("cookbook recommends only models within detected memory limits", () => {
    assert.deepEqual(recommendedModels({ ramGb: 8, vramGb: 4, cpu: "test", logicalCores: 4 }).map(({ id }) => id), [
        "qwen2.5-coder:1.5b",
        "qwen2.5-coder:3b",
    ]);
    assert.equal(recommendedModels({ ramGb: 48, vramGb: 24, cpu: "test", logicalCores: 16 }).at(-1)?.id, "qwen2.5-coder:32b");
});

test("cookbook model lookup rejects arbitrary pull targets", () => {
    assert.equal(cookbookModel("qwen2.5-coder:7b")?.minimumRamGb, 10);
    assert.equal(cookbookModel("example; rm -rf /"), undefined);
});