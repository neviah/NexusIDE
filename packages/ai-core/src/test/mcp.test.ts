import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
    assessServerRisk,
    HttpMcpTransport,
    isLoopbackUrl,
    McpClient,
    McpServerDefinition,
    serverFingerprint,
    StdioMcpTransport,
    validateServerDefinition,
} from "../index";

const signal = () => AbortSignal.timeout(5_000);

function httpServer(handler: (method: string, params: unknown) => unknown, options: { sse?: boolean } = {}) {
    const calls: string[] = [];
    const transport = new HttpMcpTransport({
        url: "http://localhost:8080",
        fetch: async (input, init) => {
            calls.push(String(input));
            const message = JSON.parse(String(init.body)) as { id?: number; method: string; params: unknown };
            if (message.id === undefined) {
                return new Response("", { status: 202 });
            }
            const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result: handler(message.method, message.params) });
            return new Response(options.sse ? `event: message\ndata: ${body}\n\n` : body, {
                status: 200,
                headers: { "mcp-session-id": "session-1" },
            });
        },
    });
    return { transport, calls };
}

test("MCP client initializes, lists tools, and calls a tool over streamable HTTP", async () => {
    const { transport } = httpServer((method) => {
        if (method === "initialize") return { protocolVersion: "2025-06-18", serverInfo: { name: "unity-mcp", version: "0.90.0" } };
        if (method === "tools/list") return { tools: [{ name: "GameObject_Create", title: "Create GameObject" }, { invalid: true }] };
        return { content: [{ type: "text", text: "Created Cube" }, { type: "image" }], isError: false };
    });
    const client = new McpClient(transport);

    const identity = await client.initialize(signal());
    const tools = await client.listTools(signal());
    const result = await client.callTool("GameObject_Create", { name: "Cube" }, signal());

    assert.equal(identity.name, "unity-mcp");
    assert.deepEqual(tools.map(({ name }) => name), ["GameObject_Create"]);
    assert.deepEqual(result, { text: "Created Cube", isError: false });
});

test("streamable HTTP accepts server-sent event bodies and reuses the resolved endpoint", async () => {
    const { transport, calls } = httpServer(() => ({ serverInfo: { name: "sse" } }), { sse: true });
    const client = new McpClient(transport);

    assert.equal((await client.initialize(signal())).name, "sse");
    assert.equal(calls[0], "http://localhost:8080");
});

test("an unresolved base URL falls back to the /mcp endpoint and then stays fixed", async () => {
    const attempted: string[] = [];
    const transport = new HttpMcpTransport({
        url: "http://localhost:8080",
        fetch: async (input, init) => {
            attempted.push(String(input));
            if (String(input).endsWith("/mcp")) {
                const message = JSON.parse(String(init.body)) as { id?: number };
                return Response.json({ jsonrpc: "2.0", id: message.id, result: { serverInfo: { name: "unity" } } });
            }
            return new Response("", { status: 404, statusText: "Not Found" });
        },
    });

    await new McpClient(transport).initialize(signal());

    assert.deepEqual(attempted, ["http://localhost:8080", "http://localhost:8080/mcp", "http://localhost:8080/mcp"]);
    assert.equal(transport.endpoint(), "http://localhost:8080/mcp");
});

test("HTTP errors and dead endpoints surface as actionable failures", async () => {
    const unauthorized = new HttpMcpTransport({
        url: "http://localhost:8080/mcp",
        fetch: async () => new Response("", { status: 401, statusText: "Unauthorized" }),
    });
    await assert.rejects(() => new McpClient(unauthorized).initialize(signal()), /responded 401/);

    const missing = new HttpMcpTransport({
        url: "http://localhost:8080",
        fetch: async () => new Response("", { status: 404, statusText: "Not Found" }),
    });
    await assert.rejects(() => new McpClient(missing).initialize(signal()), /No MCP endpoint answered/);
});

test("stdio transport correlates newline-delimited responses and ignores server log noise", async () => {
    const stdout = new PassThrough();
    const written: string[] = [];
    const transport = new StdioMcpTransport({ stdin: { write: (chunk: string) => written.push(chunk) }, stdout });
    const client = new McpClient(transport);

    const initialize = client.initialize(signal());
    stdout.write("starting server\n");
    stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "local" } } })}\n`);
    assert.equal((await initialize).name, "local");

    const list = client.listTools(signal());
    // A split chunk boundary must not corrupt framing.
    const response = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "echo" }] } });
    stdout.write(response.slice(0, 12));
    stdout.write(`${response.slice(12)}\n`);
    assert.deepEqual((await list).map(({ name }) => name), ["echo"]);
    assert.equal(written.filter((line) => line.includes("notifications/initialized")).length, 1);
});

test("a closed stdio server rejects pending requests instead of hanging", async () => {
    const stdout = new PassThrough();
    const transport = new StdioMcpTransport({ stdin: { write: () => true }, stdout });
    const client = new McpClient(transport);
    const pending = client.initialize(signal());
    await transport.close();
    await assert.rejects(() => pending, /connection is closed/);
});

test("protocol errors from the server become thrown failures", async () => {
    const transport = new HttpMcpTransport({
        url: "http://localhost:8080/mcp",
        fetch: async (_input, init) => {
            const message = JSON.parse(String(init.body)) as { id?: number };
            return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
        },
    });
    await assert.rejects(() => new McpClient(transport).initialize(signal()), /Method not found/);
});

test("tool calls are rejected before the session is initialized", async () => {
    const { transport } = httpServer(() => ({}));
    await assert.rejects(() => new McpClient(transport).listTools(signal()), /not initialized/);
});

test("fingerprints bind trust to the executable surface and tolerate rotating credentials", () => {
    const stdio = { transport: "stdio", command: "npx", args: ["-y", "server"] } as const;
    assert.equal(serverFingerprint(stdio), serverFingerprint({ ...stdio, args: ["-y", "server"] }));
    assert.notEqual(serverFingerprint(stdio), serverFingerprint({ ...stdio, args: ["-y", "other"] }));
    assert.notEqual(serverFingerprint(stdio), serverFingerprint({ ...stdio, env: { NODE_OPTIONS: "--require ./evil.js" } }));

    const http = { transport: "http", url: "http://localhost:8080", headers: { authorization: "Bearer one" } } as const;
    assert.equal(serverFingerprint(http), serverFingerprint({ ...http, headers: { authorization: "Bearer two" } }));
    assert.equal(serverFingerprint(http), serverFingerprint({ transport: "http", url: "http://localhost:8080/", headers: { Authorization: "x" } }));
    assert.notEqual(serverFingerprint(http), serverFingerprint({ ...http, url: "http://attacker.test:8080" }));
});

test("risk assessment separates local execution from remote and loopback endpoints", () => {
    const local: McpServerDefinition = { id: "a", label: "A", source: "user", connection: { transport: "stdio", command: "node", args: ["s.js"] } };
    const remote: McpServerDefinition = { id: "b", label: "B", source: "user", connection: { transport: "http", url: "https://tools.example.test/mcp" } };
    const unity: McpServerDefinition = { id: "unity", label: "Unity", source: "builtin", connection: { transport: "http", url: "http://localhost:8080" } };

    assert.equal(assessServerRisk(local).level, "executes-local-code");
    assert.equal(assessServerRisk(local).detail, "node s.js");
    assert.equal(assessServerRisk(remote).level, "sends-data-remotely");
    assert.equal(assessServerRisk(unity).level, "local-endpoint");
    assert.equal(isLoopbackUrl("http://127.0.0.1:8080"), true);
    assert.equal(isLoopbackUrl("http://localhost.attacker.test"), false);
});

test("definitions are validated before they can be stored or trusted", () => {
    const base = { id: "unity", label: "Unity", source: "user" } as const;
    assert.equal(validateServerDefinition({ ...base, connection: { transport: "http", url: "http://localhost:8080" } }), undefined);
    assert.match(validateServerDefinition({ ...base, connection: { transport: "http", url: "file:///etc/passwd" } }) ?? "", /http/);
    assert.match(validateServerDefinition({ ...base, id: "../evil", connection: { transport: "stdio", command: "node" } }) ?? "", /alphanumeric/);
    assert.match(validateServerDefinition({ ...base, connection: { transport: "stdio", command: "  " } }) ?? "", /command/);
});
