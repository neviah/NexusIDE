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

test("large workspace context remains bounded across ten thousand entries", () => {
    const attachments = Array.from({ length: 10_000 }, (_, index) => ({
        id: `${index}`,
        kind: "file" as const,
        label: `src/generated/file-${index}.ts`,
        content: "export const value = true;",
    }));
    const context = formatContext(attachments, 32_000);
    assert.ok(context.length <= 32_000);
    assert.match(context, /file-0\.ts/);
    assert.doesNotMatch(context, /file-9999\.ts/);
});