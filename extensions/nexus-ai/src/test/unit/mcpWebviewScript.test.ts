import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type Handler = (event: unknown) => void;

class FakeElement {
    public className = "";
    public dataset: Record<string, string> = {};
    public children: FakeElement[] = [];
    public readonly handlers = new Map<string, Handler>();
    private text = "";

    // Assigning textContent discards existing children, matching the DOM the script relies on to re-render.
    public get textContent(): string {
        return this.text;
    }

    public set textContent(value: string) {
        this.text = value;
        this.children = [];
    }

    public addEventListener(type: string, handler: Handler): void {
        this.handlers.set(type, handler);
    }

    public appendChild(child: FakeElement): FakeElement {
        this.children.push(child);
        return child;
    }

    public append(...nodes: FakeElement[]): void {
        this.children.push(...nodes);
    }

    /** Depth-first text of the rendered subtree, used to assert what the user can actually see. */
    public rendered(): string[] {
        return [this.textContent, ...this.children.flatMap((child) => child.rendered())].filter(Boolean);
    }

    public buttons(): FakeElement[] {
        return [...(this.dataset.action ? [this] : []), ...this.children.flatMap((child) => child.buttons())];
    }
}

function runScript() {
    const source = readFileSync(path.join(process.cwd(), "media", "mcp.js"), "utf8");
    const posted: Record<string, unknown>[] = [];
    const elements = new Map(["servers", "notice", "add", "settings", "refresh"].map((id) => [id, new FakeElement()]));
    let onMessage: Handler = () => undefined;

    const context = vm.createContext({
        acquireVsCodeApi: () => ({ postMessage: (message: Record<string, unknown>) => posted.push(message) }),
        document: {
            getElementById: (id: string) => elements.get(id),
            createElement: () => new FakeElement(),
        },
        window: {
            addEventListener: (_type: string, handler: Handler) => {
                onMessage = handler;
            },
        },
    });
    new vm.Script(source).runInContext(context);
    return { posted, elements, send: (data: unknown) => onMessage({ data } as unknown) };
}

const unityServer = {
    id: "unity",
    label: "Unity Editor",
    source: "builtin",
    transport: "http",
    riskSummary: "Connects to a service on this computer",
    riskDetail: "http://localhost:8080",
    trust: "untrusted",
    connected: false,
    status: "Not trusted",
    hasCredential: false,
    tools: [],
};

test("MCP webview announces readiness and reports an empty configuration", () => {
    const { posted, elements, send } = runScript();
    // Objects cross the vm realm boundary, so compare by value rather than by prototype identity.
    assert.equal(JSON.stringify(posted), JSON.stringify([{ type: "ready" }]));

    send({ type: "servers", servers: [], workspaceTrusted: true });
    assert.match(elements.get("notice")!.textContent, /No MCP servers configured/);
});

test("an untrusted server offers no connect control until trust is granted", () => {
    const { elements, send } = runScript();
    const servers = elements.get("servers")!;

    send({ type: "servers", servers: [unityServer], workspaceTrusted: true });
    const actions = servers.buttons().map((button) => button.dataset.action);
    assert.equal(actions.includes("connect"), false);
    assert.equal(actions.includes("trust"), true);
    assert.match(servers.rendered().join("\n"), /http:\/\/localhost:8080/);

    send({
        type: "servers",
        servers: [{ ...unityServer, trust: "trusted", connected: true, status: "Connected", serverName: "unity-mcp", tools: [{ name: "GameObject_Create" }] }],
        workspaceTrusted: true,
    });
    const trustedActions = servers.buttons().map((button) => button.dataset.action);
    assert.deepEqual(trustedActions.slice(0, 2), ["disconnect", "revoke"]);
    assert.match(servers.rendered().join("\n"), /1 tool available/);
});

test("workspace-supplied and local servers surface their specific warnings", () => {
    const { elements, send } = runScript();
    const servers = elements.get("servers")!;

    send({
        type: "servers",
        servers: [{ ...unityServer, id: "repo", source: "workspace", transport: "stdio", riskDetail: "node ./tools/server.js" }],
        workspaceTrusted: false,
    });

    const text = servers.rendered().join("\n");
    assert.match(text, /Defined by the opened workspace/);
    assert.match(text, /trusted workspace/);
    assert.match(text, /from workspace/);

    // The workspace origin stays visible after trust is granted, not just while it is pending.
    send({
        type: "servers",
        servers: [{ ...unityServer, id: "repo", source: "workspace", trust: "trusted", status: "Connected" }],
        workspaceTrusted: true,
    });
    assert.match(servers.rendered().join("\n"), /Defined by the opened workspace/);
});

test("server actions post the selected operation with its server id", () => {
    const { posted, elements, send } = runScript();
    const servers = elements.get("servers")!;
    send({ type: "servers", servers: [unityServer], workspaceTrusted: true });

    const trustButton = servers.buttons().find((button) => button.dataset.action === "trust")!;
    servers.handlers.get("click")!({ target: trustButton });
    assert.equal(JSON.stringify(posted.at(-1)), JSON.stringify({ type: "trust", id: "unity" }));

    elements.get("add")!.handlers.get("click")!({});
    assert.equal(JSON.stringify(posted.at(-1)), JSON.stringify({ type: "addServer" }));
});
