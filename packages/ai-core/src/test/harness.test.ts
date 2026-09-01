import assert from "node:assert/strict";
import test from "node:test";
import { AgentEvent, AgentRequest, CodingHarness, qualifyHarness } from "../harness";

test("a coding harness streams progress and a coherent completion summary", async () => {
    const harness: CodingHarness = {
        describe: () => ({ id: "fake", displayName: "Fake", capabilities: ["stream-progress", "cancel"] }),
        async *start(request: AgentRequest): AsyncIterable<AgentEvent> {
            yield { type: "progress", message: `Running ${request.runId}` };
            yield {
                type: "complete",
                summary: {
                    status: "completed",
                    changedFiles: [{ path: `${request.workspaceRoots[0]}/file.ts`, status: "modified" }],
                    validations: [{ command: "npm test", exitCode: 0, output: "passed" }],
                },
            };
        },
        cancel: async () => undefined,
    };

    const events: AgentEvent[] = [];
    for await (const event of harness.start({ runId: "run-1", prompt: "Edit", workspaceRoots: ["/repo"] }, new AbortController().signal)) {
        events.push(event);
    }

    assert.equal(events[0].type, "progress");
    assert.equal(events[1].type, "complete");
    assert.deepEqual(events[1].type === "complete" ? events[1].summary.changedFiles : [], [{ path: "/repo/file.ts", status: "modified" }]);
});

test("Agent mode requires the complete coding harness capability set", () => {
    assert.deepEqual(qualifyHarness({
        id: "complete",
        displayName: "Complete",
        capabilities: ["ask", "read-files", "edit-files", "run-commands", "stream-progress", "cancel"],
    }), { mode: "agent", missing: [] });
    assert.deepEqual(qualifyHarness({ id: "chat", displayName: "Chat", capabilities: ["ask", "stream-progress", "cancel"] }), {
        mode: "ask-only",
        missing: ["read-files", "edit-files", "run-commands"],
    });
    assert.equal(qualifyHarness({ id: "unknown", displayName: "Unknown", capabilities: [] }).mode, "ineligible");
});