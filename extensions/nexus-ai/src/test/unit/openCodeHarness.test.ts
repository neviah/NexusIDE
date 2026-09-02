import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type {
    ReadTextFileRequest,
    RequestPermissionRequest,
    WriteTextFileRequest,
} from "@agentclientprotocol/sdk" with { "resolution-mode": "import" };
import { AgentEvent, requireContainedPath } from "@nexus/ai-core";
import { buildOpenCodeConfig, isDeniedAgentOperation, OpenCodeHarness, OpenCodeHost, OpenCodeProcessFactory, requiresExplicitAgentApproval, selectFreeModel } from "../../openCodeHarness";

test("OpenCode ACP adapter passes the reusable harness lifecycle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nexus-acp-"));
    const host = new FakeHost(root);
    let injectedPolicy = "";
    const harness = new OpenCodeHarness(
        host,
        "unused",
        fixtureProcess((value) => { injectedPolicy = value; }),
        async () => ({ TEST_SECRET: "fixture-secret-value" }),
    );
    try {
        const events = await collect(harness.start({ runId: "conformance", prompt: "make the change", workspaceRoots: [root], modelSelection: "openrouter" }, new AbortController().signal));
        assert.equal(events.some((event) => event.type === "permission"), true);
        assert.equal(events.some((event) => event.type === "progress" && event.message.includes("OpenRouter Free")), true);
        assert.equal(events.some((event) => event.type === "text-delta" && event.text.includes("recovered")), true);
        assert.equal(events.some((event) => event.type === "command-output" && event.output.includes("failed")), true);
        assert.equal(host.reads, 1);
        assert.equal(host.writes, 2);
        assert.equal(host.previews, 2);
        const completion = events.find((event) => event.type === "complete");
        assert.ok(completion?.type === "complete");
        assert.equal(completion.summary.changedFiles.length, 2);
        assert.deepEqual(completion.summary.validations.map(({ exitCode }) => exitCode), [1, 0]);
        assert.equal(JSON.stringify(events).includes("fixture-secret-value"), false);
        assert.equal(JSON.stringify(events).includes("[REDACTED]"), true);
        const policy = JSON.parse(injectedPolicy) as { permission: { external_directory: string; edit: string; bash: Record<string, string> } };
        assert.equal(policy.permission.external_directory, "deny");
        assert.equal(policy.permission.edit, "ask");
        assert.equal(policy.permission.bash["git commit *"], "ask");
        assert.equal(policy.permission.bash["git push *"], "ask");
        assert.equal(policy.permission.bash["yarn publish *"], "deny");
        assert.equal(policy.permission.bash["git reset *--hard*"], "deny");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("commit and push require approval while destructive operations stay denied", () => {
    assert.equal(isDeniedAgentOperation("git commit -m test"), false);
    assert.equal(isDeniedAgentOperation("git push origin main"), false);
    assert.equal(requiresExplicitAgentApproval("git commit -m test"), true);
    assert.equal(requiresExplicitAgentApproval("git push origin main"), true);
    assert.equal(requiresExplicitAgentApproval("npm test"), false);
    assert.equal(isDeniedAgentOperation("git reset --hard HEAD~1"), true);
    assert.equal(isDeniedAgentOperation("git clean -fd"), true);
    assert.equal(isDeniedAgentOperation("npm publish"), true);
});

test("OpenCode receives a Windows-specific shell and verified-step contract", () => {
    const config = JSON.parse(buildOpenCodeConfig([], "win32")) as { shell?: string; agent?: { build?: { prompt?: string } } };
    assert.equal(config.shell, "pwsh");
    assert.match(config.agent?.build?.prompt ?? "", /PowerShell/);
    assert.match(config.agent?.build?.prompt ?? "", /never claim/);
    assert.match(config.agent?.build?.prompt ?? "", /Unity MCP/);

    const posix = JSON.parse(buildOpenCodeConfig([], "linux")) as { shell?: string; agent?: { build?: { prompt?: string } } };
    assert.equal(posix.shell, undefined);
    assert.match(posix.agent?.build?.prompt ?? "", /tool response/);
});

test("model selection never falls through to a paid default", () => {
    const config = [{
        id: "model",
        name: "Model",
        category: "model",
        type: "select" as const,
        currentValue: "paid/default",
        options: [
            { value: "paid/default", name: "Paid" },
            { value: "groq/free-plan", name: "Groq" },
            { value: "openrouter/example:free", name: "OpenRouter Free" },
            { value: "ollama/qwen", name: "Ollama Qwen" },
        ],
    }];
    assert.equal(selectFreeModel(config, "auto").value, "groq/free-plan");
    assert.equal(selectFreeModel(config, "auto", ["ollama/qwen", "groq/free-plan"]).value, "ollama/qwen");
    assert.equal(selectFreeModel([{ ...config[0], options: [...config[0].options, { name: "Cerebras", value: "cerebras/qwen" }] }], "auto", ["cerebras/qwen"]).value, "cerebras/qwen");
    assert.equal(selectFreeModel(config, "openrouter").value, "openrouter/example:free");
    assert.throws(() => selectFreeModel([{ ...config[0], options: config[0].options.slice(0, 1) }], "auto"), /no configured local or explicitly free model/);
});

test("cancellation stops the ACP process and emits a coherent audit summary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nexus-acp-cancel-"));
    const host = new FakeHost(root);
    const harness = new OpenCodeHarness(host, "unused", fixtureProcess(() => undefined));
    const controller = new AbortController();
    try {
        const eventsPromise = collect(harness.start({ runId: "cancel", prompt: "cancel this run", workspaceRoots: [root] }, controller.signal));
        setImmediate(() => controller.abort());
        const events = await eventsPromise;
        const cancelled = events.find((event) => event.type === "cancelled");
        assert.ok(cancelled?.type === "cancelled");
        assert.equal(cancelled.summary.status, "cancelled");
        assert.deepEqual(cancelled.summary.changedFiles, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

class FakeHost implements OpenCodeHost {
    public reads = 0;
    public writes = 0;
    public previews = 0;

    public constructor(private readonly root: string) {}

    public roots(): string[] {
        return [this.root];
    }

    public assertReady(): string[] {
        return this.roots();
    }

    public async requestPermission(params: RequestPermissionRequest) {
        for (const location of params.toolCall.locations ?? []) {
            requireContainedPath(location.path, this.roots());
        }
        const allow = params.options.find((option) => option.kind === "allow_once");
        return allow ? { outcome: { outcome: "selected" as const, optionId: allow.optionId } } : { outcome: { outcome: "cancelled" as const } };
    }

    public async readTextFile(params: ReadTextFileRequest) {
        requireContainedPath(params.path, this.roots());
        this.reads += 1;
        return { content: "export const changed = false;\n" };
    }

    public async writeTextFile(params: WriteTextFileRequest) {
        requireContainedPath(params.path, this.roots());
        this.writes += 1;
        return {};
    }

    public async previewDiff(filePath: string): Promise<void> {
        requireContainedPath(filePath, this.roots());
        this.previews += 1;
    }
}

function fixtureProcess(policy: (value: string) => void): OpenCodeProcessFactory {
    return (cwd, env) => {
        policy(env.OPENCODE_CONFIG_CONTENT ?? "");
        return spawn(process.execPath, [path.join(__dirname, "..", "fixtures", "fakeAcpAgent.js")], {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });
    };
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const values: AgentEvent[] = [];
    for await (const event of events) {
        values.push(event);
    }
    return values;
}