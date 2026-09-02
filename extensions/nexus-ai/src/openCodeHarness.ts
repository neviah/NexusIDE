import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
    AgentChangedFile,
    AgentEvent,
    AgentRequest,
    AgentRunSummary,
    AgentValidation,
    CodingHarness,
    redactText,
    requireContainedPath,
} from "@nexus/ai-core";
import type * as Acp from "@agentclientprotocol/sdk" with { "resolution-mode": "import" };
import type {
    ReadTextFileRequest,
    ReadTextFileResponse,
    RequestPermissionRequest,
    RequestPermissionResponse,
    SessionConfigOption,
    SessionUpdate,
    WriteTextFileRequest,
    WriteTextFileResponse,
} from "@agentclientprotocol/sdk" with { "resolution-mode": "import" };

type AcpModule = typeof Acp;

const importEsm = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<AcpModule>;
const DENIED_AGENT_OPERATION = /\b(git\s+(?:clean|reset\b.*--hard|checkout\s+--|restore)|(?:npm|pnpm|yarn)\s+publish|rm\s+-rf|rmdir\b|del\b|remove-item\b.*-recurse)\b/i;
const OPEN_CODE_POLICY = JSON.stringify({
    share: "disabled",
    permission: {
        edit: "ask",
        bash: {
            "*": "ask",
            "git commit": "ask",
            "git commit *": "ask",
            "git push": "ask",
            "git push *": "ask",
            "git clean *": "deny",
            "git reset *--hard*": "deny",
            "git checkout -- *": "deny",
            "git restore *": "deny",
            "npm publish": "deny",
            "npm publish *": "deny",
            "pnpm publish": "deny",
            "pnpm publish *": "deny",
            "yarn publish": "deny",
            "yarn publish *": "deny",
            "rm -rf *": "deny",
            "rmdir *": "deny",
            "del *": "deny",
            "Remove-Item * -Recurse*": "deny",
        },
        external_directory: "deny",
    },
});

export function isDeniedAgentOperation(operation: string): boolean {
    return DENIED_AGENT_OPERATION.test(operation);
}

interface ActiveRun {
    process: ChildProcessWithoutNullStreams;
    cancelSession?: () => Promise<void>;
}

export interface OpenCodeHost {
    roots(): string[];
    assertReady(): string[];
    requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse>;
    readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
    writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
    previewDiff?(path: string, oldText: string, newText: string): Promise<void>;
}

export type OpenCodeProcessFactory = (cwd: string, env: NodeJS.ProcessEnv) => ChildProcessWithoutNullStreams;
export type OpenCodeEnvironmentProvider = () => Promise<NodeJS.ProcessEnv>;

export class OpenCodeHarness implements CodingHarness {
    private readonly activeRuns = new Map<string, ActiveRun>();
    private readonly processFactory: OpenCodeProcessFactory;
    private readonly environmentProvider: OpenCodeEnvironmentProvider;

    public constructor(
        private readonly host: OpenCodeHost,
        executable?: string,
        processFactory?: OpenCodeProcessFactory,
        environmentProvider?: OpenCodeEnvironmentProvider,
    ) {
        const resolvedExecutable = resolveOpenCodeExecutable(executable);
        this.processFactory = processFactory ?? ((cwd, env) => spawn(resolvedExecutable, ["acp"], {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        }));
        this.environmentProvider = environmentProvider ?? (async () => ({}));
    }

    public describe() {
        return {
            id: "opencode",
            displayName: "OpenCode",
            capabilities: ["ask", "design", "read-files", "edit-files", "run-commands", "stream-progress", "cancel"] as const,
        };
    }

    public async *start(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
        const roots = this.host.assertReady();
        if (this.activeRuns.has(request.runId)) {
            throw new Error(`Agent run is already active: ${request.runId}`);
        }
        for (const root of request.workspaceRoots) {
            requireContainedPath(root, roots);
        }

        const queue = new AsyncEventQueue<AgentEvent>();
        const childEnvironment = await this.environmentProvider();
        const secrets = Object.values(childEnvironment).filter((value): value is string => typeof value === "string" && value.length > 0);
        const child = this.processFactory(request.workspaceRoots[0], {
            ...process.env,
            ...childEnvironment,
            OPENCODE_CONFIG_CONTENT: OPEN_CODE_POLICY,
        });
        const active: ActiveRun = { process: child };
        this.activeRuns.set(request.runId, active);
        child.stderr.on("data", (chunk: Buffer) => queue.push({ type: "progress", message: redactText(chunk.toString("utf8").trim(), secrets) }));
        child.once("error", (error) => queue.fail(error));
        const abort = () => void this.cancel(request.runId);
        signal.addEventListener("abort", abort, { once: true });

        void this.runAcp(request, child, active, queue, secrets).finally(() => {
            signal.removeEventListener("abort", abort);
            this.activeRuns.delete(request.runId);
            if (!child.killed) {
                child.kill();
            }
        });

        try {
            for await (const event of queue) {
                yield event;
            }
        } finally {
            if (this.activeRuns.has(request.runId)) {
                await this.cancel(request.runId);
            }
        }
    }

    public async cancel(runId: string): Promise<void> {
        const active = this.activeRuns.get(runId);
        if (!active) {
            return;
        }
        await active.cancelSession?.().catch(() => undefined);
        if (!active.process.killed) {
            active.process.kill();
        }
    }

    private async runAcp(
        request: AgentRequest,
        child: ChildProcessWithoutNullStreams,
        active: ActiveRun,
        queue: AsyncEventQueue<AgentEvent>,
        secrets: readonly string[],
    ): Promise<void> {
        const changedFiles = new Map<string, AgentChangedFile>();
        const validations = new Map<string, AgentValidation>();
        try {
            const acp = await importEsm("@agentclientprotocol/sdk");
            const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
            const input = Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>;
            const stream = acp.ndJsonStream(output, input);
            const result = await acp.client({ name: "NexusIDE" })
                .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
                    queue.push({
                        type: "permission",
                        toolCallId: params.toolCall.toolCallId,
                        title: params.toolCall.title ?? "OpenCode permission",
                        locations: params.toolCall.locations?.map((location) => location.path) ?? [],
                    });
                    return this.host.requestPermission(params);
                })
                .onRequest(acp.methods.client.fs.readTextFile, ({ params }) => this.host.readTextFile(params))
                .onRequest(acp.methods.client.fs.writeTextFile, ({ params }) => this.host.writeTextFile(params))
                .connectWith(stream, async (context) => {
                    await context.request(acp.methods.agent.initialize, {
                        protocolVersion: acp.PROTOCOL_VERSION,
                        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
                        clientInfo: { name: "NexusIDE", version: "0.1.0" },
                    });
                    return context.buildSession(request.workspaceRoots[0])
                        .withAdditionalDirectories(request.workspaceRoots.slice(1))
                        .withSession(async (session) => {
                            active.cancelSession = () => context.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
                            if (request.modelSelection) {
                                const selectedModel = selectFreeModel(session.newSessionResponse.configOptions ?? [], request.modelSelection, request.preferredRoutes);
                                await context.request(acp.methods.agent.session.setConfigOption, {
                                    sessionId: session.sessionId,
                                    configId: selectedModel.configId,
                                    value: selectedModel.value,
                                });
                                queue.push({ type: "progress", message: `OpenCode model: ${selectedModel.name}` });
                            }
                            void session.prompt(request.prompt);
                            for (;;) {
                                const message = await session.nextUpdate();
                                if (message.kind === "stop") {
                                    return message.stopReason;
                                }
                                await this.mapUpdate(message.update, queue, changedFiles, validations, secrets);
                            }
                        });
                });

            const status = result === "cancelled" ? "cancelled" : "completed";
            const summary: AgentRunSummary = { status, changedFiles: [...changedFiles.values()], validations: [...validations.values()] };
            queue.push(status === "cancelled" ? { type: "cancelled", summary } : { type: "complete", summary });
            queue.end();
        } catch (error) {
            const cancelled = child.killed;
            const message = redactText(error instanceof Error ? error.message : String(error), secrets);
            const summary: AgentRunSummary = { status: cancelled ? "cancelled" : "failed", changedFiles: [...changedFiles.values()], validations: [...validations.values()], message };
            queue.push(cancelled ? { type: "cancelled", summary } : { type: "failure", error: message, summary });
            queue.end();
        }
    }

    private async mapUpdate(
        update: SessionUpdate,
        queue: AsyncEventQueue<AgentEvent>,
        changedFiles: Map<string, AgentChangedFile>,
        validations: Map<string, AgentValidation>,
        secrets: readonly string[],
    ): Promise<void> {
        if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
            queue.push({ type: "text-delta", text: redactText(update.content.text, secrets) });
            return;
        }
        if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
            return;
        }
        const status = update.status === "in_progress" ? "in-progress" : update.status ?? "pending";
        queue.push({
            type: "tool",
            toolCallId: update.toolCallId,
            title: update.title ?? "OpenCode tool",
            kind: update.kind ?? "other",
            status,
        });
        for (const content of update.content ?? []) {
            if (content.type === "diff") {
                const filePath = requireContainedPath(content.path, this.host.roots());
                await this.host.previewDiff?.(filePath, content.oldText ?? "", content.newText);
                const change: AgentChangedFile = { path: filePath, status: content.oldText == null ? "created" : "modified" };
                changedFiles.set(filePath, change);
                queue.push({ type: "file-change", change });
            } else if (content.type === "content" && content.content.type === "text" && update.kind === "execute") {
                queue.push({ type: "command-output", terminalId: update.toolCallId, output: redactText(content.content.text, secrets) });
            }
        }
        if (update.kind === "execute" && (update.status === "completed" || update.status === "failed")) {
            validations.set(update.toolCallId, {
                command: commandFrom(update.rawInput, update.title),
                exitCode: exitCodeFrom(update.rawOutput, update.status),
                output: (update.content ?? [])
                    .filter((content) => content.type === "content" && content.content.type === "text")
                    .map((content) => content.type === "content" && content.content.type === "text" ? content.content.text : "")
                    .join("\n"),
            });
            const validation = validations.get(update.toolCallId);
            if (validation) {
                validations.set(update.toolCallId, { ...validation, output: redactText(validation.output, secrets).slice(-8_000) });
            }
        }
    }
}

export function selectFreeModel(
    configOptions: readonly SessionConfigOption[],
    selection: "auto" | "ollama" | "openrouter" | "groq",
    preferredRoutes: readonly string[] = [],
): { configId: string; value: string; name: string } {
    const modelConfig = configOptions.find((option) => option.type === "select" && (option.category === "model" || option.id === "model"));
    if (!modelConfig || modelConfig.type !== "select") {
        throw new Error("OpenCode did not advertise a model selector.");
    }
    const options = modelConfig.options.flatMap((option) => "group" in option ? option.options : [option]);
    if (selection === "auto") {
        for (const route of preferredRoutes) {
            const match = options.find((option) => option.value === route && isNoCostModel(option.value));
            if (match) return { configId: modelConfig.id, value: match.value, name: match.name };
        }
    }
    const prefixes = selection === "auto" ? ["groq/", "openrouter-free", "ollama/"] : selection === "openrouter" ? ["openrouter-free"] : [`${selection}/`];
    for (const prefix of prefixes) {
        const match = options.find((option) => prefix === "openrouter-free"
            ? option.value.startsWith("openrouter/") && option.value.endsWith(":free")
            : option.value.startsWith(prefix));
        if (match) {
            return { configId: modelConfig.id, value: match.value, name: match.name };
        }
    }
    throw new Error(`OpenCode has no configured ${selection === "auto" ? "local or explicitly free" : selection} model.`);
}

export function resolveOpenCodeExecutable(configured?: string): string {
    if (process.platform !== "win32") {
        return configured || "opencode";
    }
    if (configured && !/opencode\.(?:cmd|ps1)$/i.test(configured)) {
        return configured;
    }

    const launcherDirectories = new Set<string>();
    if (configured && path.dirname(configured) !== ".") {
        launcherDirectories.add(path.dirname(configured));
    }
    if (process.env.APPDATA) {
        launcherDirectories.add(path.join(process.env.APPDATA, "npm"));
    }
    for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
        launcherDirectories.add(directory.replace(/^"|"$/g, ""));
    }
    for (const directory of launcherDirectories) {
        const nativeExecutable = path.join(directory, "node_modules", "opencode-ai", "bin", "opencode.exe");
        if (existsSync(nativeExecutable)) {
            return nativeExecutable;
        }
        const directExecutable = path.join(directory, "opencode.exe");
        if (existsSync(directExecutable)) {
            return directExecutable;
        }
    }
    return configured || "opencode.exe";
}

function commandFrom(rawInput: unknown, fallback?: string | null): string {
    if (rawInput && typeof rawInput === "object" && "command" in rawInput && typeof rawInput.command === "string") {
        return rawInput.command;
    }
    return fallback ?? "OpenCode command";
}

function exitCodeFrom(rawOutput: unknown, status: "completed" | "failed"): number | null {
    if (rawOutput && typeof rawOutput === "object" && "exitCode" in rawOutput && typeof rawOutput.exitCode === "number") {
        return rawOutput.exitCode;
    }
    return status === "completed" ? 0 : 1;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
    private readonly values: T[] = [];
    private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
    private ended = false;
    private error?: unknown;

    public push(value: T): void {
        if (this.ended) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value, done: false });
        } else {
            this.values.push(value);
        }
    }

    public end(): void {
        this.ended = true;
        while (this.waiters.length > 0) {
            this.waiters.shift()?.({ value: undefined, done: true });
        }
    }

    public fail(error: unknown): void {
        this.error = error;
        this.end();
    }

    public async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
            if (this.values.length > 0) {
                yield this.values.shift() as T;
                continue;
            }
            if (this.error) {
                throw this.error;
            }
            if (this.ended) {
                return;
            }
            const result = await new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
            if (result.done) {
                if (this.error) {
                    throw this.error;
                }
                return;
            }
            yield result.value;
        }
    }
}

function isNoCostModel(value: string): boolean {
    const freePrefixes = ["ollama/", "groq/", "nvidia/", "gemini/", "cerebras/", "mistral/"];
    return freePrefixes.some((prefix) => value.startsWith(prefix)) || (value.startsWith("openrouter/") && value.endsWith(":free"));
}