import assert from "node:assert/strict";
import test from "node:test";
import { McpServerDefinition } from "@nexus/ai-core";
import { canonicalMcpResource, mergeUnityPreset, parseCommandLine, parseServerDefinitions, parseWorkspaceMcpDocument, protectedResourceMetadataUrl, unityServerDefinition, UNITY_DEFAULT_URL } from "../../mcpServerDefinitions";
import { admitConnection, McpTrustStore } from "../../mcpTrustStore";
import { buildOpenCodeConfig } from "../../openCodeHarness";

function memoryStorage() {
    const value: Record<string, unknown> = {};
    return {
        value,
        storage: {
            get<T>(key: string, fallback: T): T {
                return (value[key] as T) ?? fallback;
            },
            async update(key: string, next: unknown): Promise<void> {
                value[key] = next;
            },
        },
    };
}

const httpServer = (id: string, url: string, source: McpServerDefinition["source"] = "user"): McpServerDefinition =>
    ({ id, label: id, source, connection: { transport: "http", url } });

test("OAuth discovery preserves a pinned endpoint while using the metadata's canonical resource", () => {
    const endpoint = canonicalMcpResource("https://ai-game.dev/mcp/p/project-pin/");
    assert.equal(endpoint, "https://ai-game.dev/mcp/p/project-pin");
    assert.equal(protectedResourceMetadataUrl(endpoint), "https://ai-game.dev/.well-known/oauth-protected-resource/mcp/p/project-pin");
    assert.equal(canonicalMcpResource("https://ai-game.dev/mcp"), "https://ai-game.dev/mcp");
});

test("workspace-supplied server definitions keep their scope and never appear as user configuration", () => {
    const definitions = parseServerDefinitions({
        global: { mine: { transport: "http", url: "http://localhost:9000", label: "Mine" } },
        workspace: { repo: { transport: "stdio", command: "node", args: ["./tools/server.js"] } },
        workspaceFolder: { folder: { transport: "http", url: "https://folder.example.test/mcp" } },
    });

    assert.deepEqual(definitions.map(({ id, source }) => [id, source]), [["mine", "user"], ["repo", "workspace"], ["folder", "workspace"]]);
    assert.equal(definitions.find(({ id }) => id === "mine")?.label, "Mine");
});

test("standard VS Code mcp.json entries are workspace-supplied definitions", () => {
    const definitions = parseWorkspaceMcpDocument({
        servers: {
            "ai-game-developer": { type: "http", url: "https://ai-game.dev/mcp/p/project-pin" },
            local: { command: "npx", args: ["-y", "local-mcp"] },
        },
    });

    assert.deepEqual(definitions.map(({ id, source, connection }) => [id, source, connection]), [
        ["ai-game-developer", "workspace", { transport: "http", url: "https://ai-game.dev/mcp/p/project-pin", headers: undefined }],
        ["local", "workspace", { transport: "stdio", command: "npx", args: ["-y", "local-mcp"], env: undefined, cwd: undefined }],
    ]);
});

test("a workspace definition cannot impersonate a user definition by reusing its id", () => {
    const definitions = parseServerDefinitions({
        global: { unity: { transport: "http", url: "http://localhost:8080" } },
        workspace: { unity: { transport: "stdio", command: "curl", args: ["attacker.test"] } },
    });

    // Last writer wins by id, but the surviving entry must still carry the workspace source
    // so it is presented as untrusted and re-consented rather than inheriting the user grant.
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].source, "workspace");
});

test("malformed and unsupported server entries are discarded", () => {
    const definitions = parseServerDefinitions({
        global: {
            "bad id": { transport: "http", url: "http://localhost:1" },
            noTransport: { url: "http://localhost:2" },
            badUrl: { transport: "http", url: "not-a-url" },
            fileUrl: { transport: "http", url: "file:///etc/passwd" },
            emptyCommand: { transport: "stdio", command: "   " },
            good: { transport: "stdio", command: "node", args: ["a.js", 7] },
        },
    });

    assert.deepEqual(definitions.map(({ id }) => id), ["good"]);
    assert.deepEqual(definitions[0].connection, { transport: "stdio", command: "node", args: ["a.js"], env: undefined, cwd: undefined });
});

test("the Unity preset is offered by default and yields to an explicit definition", () => {
    const preset = mergeUnityPreset([], UNITY_DEFAULT_URL);
    assert.deepEqual(preset.map(({ id, source }) => [id, source]), [["unity", "builtin"]]);
    assert.deepEqual(unityServerDefinition("  ").connection, { transport: "http", url: UNITY_DEFAULT_URL });

    const explicit = mergeUnityPreset([httpServer("unity", "http://localhost:9100")], UNITY_DEFAULT_URL);
    assert.equal(explicit.length, 1);
    assert.equal(explicit[0].source, "user");
});

test("trust is granted per server and revoked when the definition changes", async () => {
    const { storage } = memoryStorage();
    const trust = new McpTrustStore(storage);
    const unity = httpServer("unity", "http://localhost:8080");

    assert.equal(trust.state(unity), "untrusted");
    await trust.trust(unity, new Date("2026-09-02T00:00:00.000Z"));
    assert.equal(trust.state(unity), "trusted");
    assert.equal(trust.grantedAt("unity"), "2026-09-02T00:00:00.000Z");

    assert.equal(trust.state(httpServer("unity", "http://attacker.test:8080")), "changed");
    assert.equal(trust.state({ ...unity, connection: { transport: "stdio", command: "node" } }), "changed");
    assert.equal(trust.state(unity), "trusted");

    await trust.revoke("unity");
    assert.equal(trust.state(unity), "untrusted");
});

test("rotating a credential preserves trust while relocating the endpoint does not", async () => {
    const { storage } = memoryStorage();
    const trust = new McpTrustStore(storage);
    const server: McpServerDefinition = { id: "tools", label: "Tools", source: "user", connection: { transport: "http", url: "https://tools.example.test/mcp", headers: { authorization: "Bearer one" } } };
    await trust.trust(server);

    assert.equal(trust.state({ ...server, connection: { ...server.connection, headers: { authorization: "Bearer two" } } as never }), "trusted");
    assert.equal(trust.state({ ...server, connection: { transport: "http", url: "https://other.example.test/mcp" } }), "changed");
});

test("malformed trust records are discarded instead of granting access", () => {
    const { storage } = memoryStorage();
    void storage.update("nexusAI.mcp.trust.v1", { unity: { fingerprint: 42 }, other: "trusted", third: null });
    assert.equal(new McpTrustStore(storage).state(httpServer("unity", "http://localhost:8080")), "untrusted");
});

test("a workspace definition cannot inherit trust granted to an identical user definition", async () => {
    const { storage } = memoryStorage();
    const trust = new McpTrustStore(storage);
    const url = "http://localhost:8080";
    await trust.trust(httpServer("unity", url, "user"));

    // Same id and identical executable surface, but supplied by the opened repository.
    assert.equal(trust.state(httpServer("unity", url, "workspace")), "changed");
    assert.equal(trust.state(httpServer("unity", url, "user")), "trusted");

    await trust.trust(httpServer("unity", url, "workspace"));
    assert.equal(trust.state(httpServer("unity", url, "workspace")), "trusted");
});

test("trust records without a recorded source fail closed for workspace definitions", async () => {
    const { storage } = memoryStorage();
    const trust = new McpTrustStore(storage);
    await trust.trust(httpServer("unity", "http://localhost:8080", "user"));
    const records = storage.get<Record<string, Record<string, unknown>>>("nexusAI.mcp.trust.v1", {});
    delete records.unity.source;
    await storage.update("nexusAI.mcp.trust.v1", records);

    assert.equal(trust.state(httpServer("unity", "http://localhost:8080", "workspace")), "changed");
    assert.equal(trust.state(httpServer("unity", "http://localhost:8080", "user")), "trusted");
});

test("typed server commands keep quoted paths and arguments intact", () => {
    assert.deepEqual(parseCommandLine("npx -y my-mcp-server"), { command: "npx", args: ["-y", "my-mcp-server"] });
    assert.deepEqual(parseCommandLine('"C:\\Program Files\\tool\\mcp.exe" --port 8080'), {
        command: "C:\\Program Files\\tool\\mcp.exe",
        args: ["--port", "8080"],
    });
    assert.deepEqual(parseCommandLine("   "), { command: "", args: [] });
});

test("connection admission refuses untrusted, changed, and untrusted-workspace local servers", () => {
    assert.deepEqual(admitConnection({ trust: "trusted", transport: "http", workspaceTrusted: false }), { allowed: true });
    assert.deepEqual(admitConnection({ trust: "trusted", transport: "stdio", workspaceTrusted: true }), { allowed: true });

    assert.equal(admitConnection({ trust: "untrusted", transport: "http", workspaceTrusted: true }).allowed, false);
    assert.match(admitConnection({ trust: "changed", transport: "http", workspaceTrusted: true }).reason ?? "", /changed/);
    assert.match(admitConnection({ trust: "trusted", transport: "stdio", workspaceTrusted: false }).reason ?? "", /trusted workspace/);
});

test("the agent receives only trusted servers and keeps the destructive-command policy", () => {
    const empty = JSON.parse(buildOpenCodeConfig([])) as Record<string, unknown>;
    assert.equal("mcp" in empty, false);
    assert.equal((empty.permission as Record<string, unknown>).edit, "ask");
    // The harness allows every unlisted permission, so network egress must be named explicitly.
    assert.equal((empty.permission as Record<string, unknown>).webfetch, "ask");
    assert.equal((empty.permission as Record<string, unknown>).websearch, "ask");

    const config = JSON.parse(buildOpenCodeConfig([
        { id: "unity", connection: { transport: "http", url: "http://localhost:8080" }, token: "unity-token" },
        { id: "local", connection: { transport: "stdio", command: "node", args: ["server.js"], env: { MODE: "test" } } },
    ])) as { mcp: Record<string, Record<string, unknown>>; permission: Record<string, Record<string, string>> };

    assert.deepEqual(config.mcp.unity, {
        type: "remote",
        url: "http://localhost:8080",
        enabled: true,
        headers: { Authorization: "Bearer unity-token" },
    });
    assert.deepEqual(config.mcp.local, {
        type: "local",
        command: ["node", "server.js"],
        enabled: true,
        environment: { MODE: "test" },
    });
    assert.equal(config.permission.bash["rm -rf *"], "deny");
});
