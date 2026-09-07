import { CodingHarness, AgentRequest, AgentEvent, requireContainedPath } from "@nexus/ai-core";
import type { SecretStore } from "@nexus/ai-core";
import type * as PiAgentCore from "@earendil-works/pi-agent-core" with { "resolution-mode": "import" };

type PiAgentEvent = PiAgentCore.AgentEvent;
type StreamFn = PiAgentCore.StreamFn;

export interface PiHarnessOptions {
    secretStore: SecretStore;
    defaultModelId: string;
    streamFn: StreamFn;
    workspaceRoots: readonly string[];
    systemPrompt: string;
}

class AgentEventQueue implements AsyncIterable<AgentEvent> {
    private readonly items: AgentEvent[] = [];
    private readonly waiters: { resolve(): void; reject(error: unknown): void }[] = [];
    private closed = false;

    public push(event: AgentEvent): void {
        this.items.push(event);
        for (const waiter of this.waiters.splice(0)) waiter.resolve();
    }

    public fail(error: unknown): void {
        this.closed = true;
        for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    }

    public end(): void {
        this.closed = true;
        for (const waiter of this.waiters.splice(0)) waiter.resolve();
    }

    public async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
        while (!this.closed || this.items.length > 0) {
            const event = this.items.shift();
            if (event) {
                yield event;
                continue;
            }
            if (this.closed) {
                return;
            }
            await new Promise<void>((resolve, reject) => {
                this.waiters.push({ resolve, reject });
            });
        }
    }
}

export class PiHarness implements CodingHarness {
    private agent?: PiAgentCore.Agent;
    private readonly options: PiHarnessOptions;

    public constructor(options: PiHarnessOptions) {
        this.options = options;
    }

    public describe() {
        return {
            id: "pi",
            displayName: "Pi",
            capabilities: ["ask", "design", "read-files", "edit-files", "run-commands", "stream-progress", "cancel"] as const,
        };
    }

    public async initialize(): Promise<void> {
        const { Agent, createReadTool, createEditTool, createWriteTool, createBashTool } = await import("@earendil-works/pi-agent-core") as typeof PiAgentCore;
        const tools = [
            createReadTool(),
            createEditTool(),
            createWriteTool(),
            createBashTool({ commandPrefix: "pwsh" }),
        ];
        this.agent = new Agent({
            initialState: {
                systemPrompt: this.options.systemPrompt,
                model: undefined as never,
            },
            streamFn: this.options.streamFn,
            beforeToolCall: async ({ toolCall, args }) => {
                if (toolCall.name === "read" && typeof (args as { path?: string }).path === "string") {
                    const path = (args as { path: string }).path;
                    try {
                        requireContainedPath(path, this.options.workspaceRoots);
                    } catch {
                        return { block: true, reason: `Path is outside the workspace: ${path}` };
                    }
                }
                return undefined;
            },
        });
    }

    public async *start(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
        if (!this.agent) {
            await this.initialize();
        }
        const agent = this.agent!;
        const roots = this.options.workspaceRoots;
        for (const root of request.workspaceRoots) {
            requireContainedPath(root, roots);
        }
        const queue = new AgentEventQueue();
        const unsubscribe = agent.subscribe(async (event: PiAgentEvent) => {
            if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
                queue.push({ type: "text-delta", text: event.assistantMessageEvent.delta });
            } else if (event.type === "tool_execution_start") {
                queue.push({ type: "tool", toolCallId: event.toolCallId, title: event.toolName, kind: "other", status: "in-progress" });
            } else if (event.type === "tool_execution_end") {
                queue.push({ type: "tool", toolCallId: event.toolCallId, title: event.toolName, kind: "other", status: event.isError ? "failed" : "completed" });
            } else if (event.type === "agent_end") {
                const lastAssistant = event.messages.filter((message) => message.role === "assistant").at(-1);
                const text = lastAssistant?.content?.filter((content) => content.type === "text").map((content) => content.text).join("") ?? "";
                queue.push({ type: "complete", summary: { status: "completed", changedFiles: [], validations: [], message: text } });
                queue.end();
            }
        });
        const abort = () => agent.abort();
        signal.addEventListener("abort", abort, { once: true });
        try {
            void agent.prompt(request.prompt);
            for await (const event of queue) {
                yield event;
            }
        } finally {
            signal.removeEventListener("abort", abort);
            unsubscribe();
        }
    }

    public async cancel(_runId: string): Promise<void> {
        this.agent?.abort();
    }

    public listCheckpoints(): readonly { id: string; createdAt: string; files: readonly unknown[] }[] {
        return [];
    }
}

export function createPiHarness(options: PiHarnessOptions): CodingHarness {
    return new PiHarness(options);
}
