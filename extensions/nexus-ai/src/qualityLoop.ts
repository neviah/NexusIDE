import { AgentChangedFile, AgentEvent, AgentRequest, AgentRunSummary, CodingHarness } from "@nexus/ai-core";

export interface QualityLoopOptions {
    request: AgentRequest;
    qualityBar: string;
    maxRounds: number;
    onRunStart?(runId: string): void;
}

export async function* runQualityLoop(harness: CodingHarness, options: QualityLoopOptions, signal: AbortSignal): AsyncGenerator<AgentEvent> {
    const maxRounds = Math.max(1, Math.min(5, Math.floor(options.maxRounds)));
    const changedFiles = new Map<string, AgentChangedFile>();
    const validations = new Map<string, AgentRunSummary["validations"][number]>();
    let feedback = "";

    for (let round = 1; round <= maxRounds; round += 1) {
        yield { type: "progress", message: `Quality Loop: builder round ${round} of ${maxRounds}` };
        const builderId = `${options.request.runId}-builder-${round}`;
        options.onRunStart?.(builderId);
        const builderPrompt = round === 1
            ? options.request.prompt
            : `${options.request.prompt}\n\nA separate critic rejected the previous result. Address this feedback, inspect the current workspace state, and validate the revised implementation:\n${feedback}`;
        let builderText = "";
        let builderTerminal: Extract<AgentEvent, { type: "complete" | "cancelled" | "failure" }> | undefined;
        for await (const event of harness.start({ ...options.request, runId: builderId, prompt: builderPrompt }, signal)) {
            if (event.type === "text-delta") builderText += event.text;
            if (event.type === "complete" || event.type === "cancelled" || event.type === "failure") {
                builderTerminal = event;
                mergeSummary(event.summary, changedFiles, validations);
            } else {
                yield event;
            }
        }
        if (!builderTerminal || builderTerminal.type === "cancelled" || builderTerminal.type === "failure") {
            if (builderTerminal) yield builderTerminal;
            return;
        }

        yield { type: "progress", message: `Quality Loop: independent critique ${round} of ${maxRounds}` };
        const criticId = `${options.request.runId}-critic-${round}`;
        options.onRunStart?.(criticId);
        const criticPrompt = `Act only as a read-only critic. Do not edit files or run destructive commands. Inspect the current workspace and compare it with the requested task and quality bar.\n\nTask:\n${options.request.prompt}\n\nQuality bar:\n${options.qualityBar}\n\nBuilder report:\n${builderText || "No narrative report."}\n\nValidation evidence:\n${formatValidationFeedback(builderTerminal.summary) || "No commands or tests reported."}\n\nReturn exactly one verdict line: VERDICT: PASS or VERDICT: FAIL. After it, give concise evidence and required fixes.`;
        let critique = "";
        let criticTerminal: Extract<AgentEvent, { type: "complete" | "cancelled" | "failure" }> | undefined;
        for await (const event of harness.start({ ...options.request, runId: criticId, prompt: criticPrompt }, signal)) {
            if (event.type === "text-delta") critique += event.text;
            else if (event.type === "complete" || event.type === "cancelled" || event.type === "failure") criticTerminal = event;
            else yield event;
        }
        if (!criticTerminal || criticTerminal.type === "cancelled" || criticTerminal.type === "failure") {
            if (criticTerminal) yield criticTerminal;
            return;
        }
        if (/^VERDICT:\s*PASS\s*$/im.test(critique)) {
            yield { type: "progress", message: `Quality Loop passed after ${round} round${round === 1 ? "" : "s"}.` };
            yield { type: "complete", summary: combinedSummary(changedFiles, validations, `Quality Loop passed after ${round} round${round === 1 ? "" : "s"}.`) };
            return;
        }
        const nextFeedback = critique.trim() || "The critic did not provide an actionable verdict.";
        if (round === maxRounds || nextFeedback === feedback) {
            yield { type: "progress", message: `Quality Loop stopped at its ${maxRounds}-round budget without a pass verdict.` };
            yield { type: "complete", summary: combinedSummary(changedFiles, validations, `Quality Loop budget exhausted. Last critique: ${nextFeedback}`) };
            return;
        }
        feedback = nextFeedback;
    }
}

function mergeSummary(summary: AgentRunSummary, files: Map<string, AgentChangedFile>, validations: Map<string, AgentRunSummary["validations"][number]>): void {
    for (const change of summary.changedFiles) files.set(change.path, change);
    for (const validation of summary.validations) validations.set(`${validation.command}\0${validation.exitCode}`, validation);
}

function combinedSummary(files: Map<string, AgentChangedFile>, validations: Map<string, AgentRunSummary["validations"][number]>, message: string): AgentRunSummary {
    return { status: "completed", changedFiles: [...files.values()], validations: [...validations.values()], message };
}

export function formatValidationFeedback(summary: AgentRunSummary, maximumChars = 4_000): string {
    const failed = summary.validations.filter((validation) => validation.exitCode !== 0);
    const lines = failed.map((validation) => `Command: ${validation.command}\nExit code: ${validation.exitCode ?? "unknown"}\nOutput:\n${validation.output.slice(-1_200)}`);
    return lines.join("\n\n").slice(-maximumChars);
}