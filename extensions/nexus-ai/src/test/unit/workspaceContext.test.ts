import assert from "node:assert/strict";
import test from "node:test";
import { formatContext } from "../../workspaceContextTypes";

test("workspace context is bounded and labels each source", () => {
    const context = formatContext([
        { id: "1", kind: "file", label: "src/app.ts", content: "a".repeat(20) },
        { id: "2", kind: "diagnostics", label: "diagnostics", content: "error" },
    ], 45);
    assert.match(context, /src\/app\.ts \(file\)/);
    assert.ok(context.length <= 45);
});