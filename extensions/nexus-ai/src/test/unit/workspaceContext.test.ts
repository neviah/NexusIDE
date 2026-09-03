import assert from "node:assert/strict";
import test from "node:test";
import { formatContext, formatContextBudget } from "../../workspaceContextTypes";
import { formatWorkspaceInstructions } from "../../workspaceInstructions";

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

test("context budgets report omitted attachments and workspace instructions stay bounded", () => {
    const budget = formatContextBudget([
        { id: "1", kind: "file", label: "first", content: "a".repeat(80) },
        { id: "2", kind: "file", label: "second", content: "b".repeat(80) },
    ], 50);
    assert.ok(budget.usedChars <= 50);
    assert.equal(budget.omittedAttachments, 1);

    const instructions = formatWorkspaceInstructions([{ path: "C:/project/AGENTS.md", content: "c".repeat(100) }], 80);
    assert.ok(instructions.length <= 80);
    assert.match(instructions, /Instructions truncated/);
});