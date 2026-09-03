import assert from "node:assert/strict";
import test from "node:test";
import { AgentEvent, AgentRequest, CodingHarness } from "@nexus/ai-core";
import { formatValidationFeedback, runQualityLoop } from "../../qualityLoop";

test("quality loop uses a fresh critic and stops on an explicit pass", async () => {
    const harness = new FakeHarness(["builder report", "VERDICT: PASS\nRequirements are met."]);
    const events = await collect(runQualityLoop(harness, options(3), new AbortController().signal));
    assert.equal(harness.requests.length, 2);
    assert.match(harness.requests[1].prompt, /read-only critic/);
    assert.equal(events.at(-1)?.type, "complete");
    assert.equal(events.some((event) => event.type === "text-delta" && event.text.includes("VERDICT")), false);
});

test("quality loop feeds critique back to the builder and respects its round budget", async () => {
    const harness = new FakeHarness(["first", "VERDICT: FAIL\nAdd tests.", "second", "VERDICT: FAIL\nStill incomplete."]);
    const events = await collect(runQualityLoop(harness, options(2), new AbortController().signal));
    assert.equal(harness.requests.length, 4);
    assert.match(harness.requests[2].prompt, /Add tests/);
    assert.match(events.find((event) => event.type === "complete")?.type === "complete" ? events.find((event) => event.type === "complete")!.summary.message ?? "" : "", /budget exhausted/i);
});

test("quality loop provides only failed validation evidence to its critic", async () => {
    const summary = { status: "completed" as const, changedFiles: [], validations: [
        { command: "npm test", exitCode: 1, output: "expected true, received false" },
        { command: "npm run lint", exitCode: 0, output: "clean" },
    ] };
    const feedback = formatValidationFeedback(summary);
    assert.match(feedback, /npm test/);
    assert.doesNotMatch(feedback, /npm run lint/);
    assert.match(feedback, /received false/);
});

class FakeHarness implements CodingHarness {
    public readonly requests: AgentRequest[] = [];
    public constructor(private readonly responses: string[]) {}
    public describe() { return { id: "fake", displayName: "Fake", capabilities: ["read-files", "edit-files", "run-commands", "stream-progress", "cancel"] as const }; }
    public async *start(request: AgentRequest): AsyncIterable<AgentEvent> {
        this.requests.push(request);
        yield { type: "text-delta", text: this.responses.shift() ?? "" };
        yield { type: "complete", summary: { status: "completed", changedFiles: [], validations: [] } };
    }
    public async cancel(): Promise<void> {}
}

function options(maxRounds: number) {
    return { request: { runId: "quality", prompt: "Implement it", workspaceRoots: ["C:\\workspace"], modelSelection: "auto" as const }, qualityBar: "Tests pass", maxRounds };
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    for await (const event of iterable) events.push(event);
    return events;
}