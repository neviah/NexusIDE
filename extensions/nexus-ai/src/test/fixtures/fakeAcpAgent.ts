import path from "node:path";
import readline from "node:readline";

interface WireMessage {
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
}

let sessionId = "fixture-session";
let workspaceRoot = process.cwd();
let promptRequestId: string | number | undefined;
let filePath = "";
let secondFilePath = "";

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
    const message = JSON.parse(line) as WireMessage;
    if (message.method === "initialize") {
        respond(message.id, { protocolVersion: 1, agentCapabilities: {} });
    } else if (message.method === "session/new") {
        workspaceRoot = String(message.params?.cwd ?? process.cwd());
        filePath = path.join(workspaceRoot, "src", "fixture.ts");
        secondFilePath = path.join(workspaceRoot, "src", "fixture.test.ts");
        respond(message.id, {
            sessionId,
            configOptions: [{
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "paid/default",
                options: [
                    { value: "paid/default", name: "Paid Default" },
                    { value: "openrouter/example/free:free", name: "OpenRouter Free" },
                ],
            }],
        });
    } else if (message.method === "session/set_config_option") {
        respond(message.id, { configOptions: [] });
    } else if (message.method === "session/prompt") {
        promptRequestId = message.id;
        if (JSON.stringify(message.params).includes("cancel this run")) {
            update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Waiting for cancellation" } });
            return;
        }
        update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Applying the fixture change." } });
        update({ sessionUpdate: "tool_call", toolCallId: "edit-1", title: "Edit fixture", kind: "edit", status: "pending", locations: [{ path: filePath }] });
        request("permission-1", "session/request_permission", {
            sessionId,
            toolCall: { toolCallId: "edit-1", title: "Edit fixture", kind: "edit", locations: [{ path: filePath }] },
            options: [
                { optionId: "allow", name: "Allow once", kind: "allow_once" },
                { optionId: "reject", name: "Reject", kind: "reject_once" },
            ],
        });
    } else if (message.method === "session/cancel") {
        finish("cancelled");
    } else if (message.id === "permission-1") {
        request("read-1", "fs/read_text_file", { sessionId, path: filePath });
    } else if (message.id === "read-1") {
        request("write-1", "fs/write_text_file", { sessionId, path: filePath, content: "export const changed = true;\n" });
    } else if (message.id === "write-1") {
        request("write-2", "fs/write_text_file", { sessionId, path: secondFilePath, content: "export const testUpdated = true;\n" });
    } else if (message.id === "write-2") {
        update({
            sessionUpdate: "tool_call_update",
            toolCallId: "edit-1",
            title: "Edit fixture",
            kind: "edit",
            status: "completed",
            content: [
                { type: "diff", path: filePath, oldText: "export const changed = false;\n", newText: "export const changed = true;\n" },
                { type: "diff", path: secondFilePath, oldText: "export const testUpdated = false;\n", newText: "export const testUpdated = true;\n" },
            ],
        });
        validation("test-1", "npm test", "failed", 1, "first run failed");
        validation("test-2", "npm test", "completed", 0, `second run passed ${process.env.TEST_SECRET ?? ""}`);
        update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: " Validation recovered." } });
        finish("end_turn");
    }
});

function validation(id: string, command: string, status: "completed" | "failed", exitCode: number, output: string): void {
    update({
        sessionUpdate: "tool_call",
        toolCallId: id,
        title: command,
        kind: "execute",
        status,
        rawInput: { command },
        rawOutput: { exitCode },
        content: [{ type: "content", content: { type: "text", text: output } }],
    });
}

function update(value: Record<string, unknown>): void {
    notify("session/update", { sessionId, update: value });
}

function finish(stopReason: "end_turn" | "cancelled"): void {
    if (promptRequestId !== undefined) {
        respond(promptRequestId, { stopReason });
        promptRequestId = undefined;
    }
}

function request(id: string, method: string, params: Record<string, unknown>): void {
    send({ jsonrpc: "2.0", id, method, params });
}

function notify(method: string, params: Record<string, unknown>): void {
    send({ jsonrpc: "2.0", method, params });
}

function respond(id: string | number | undefined, result: unknown): void {
    send({ jsonrpc: "2.0", id, result });
}

function send(message: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}