import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

test("chat webview script attaches controls and announces readiness", () => {
    const source = readFileSync(path.join(process.cwd(), "media", "chat.js"), "utf8");
    const viewSource = readFileSync(path.join(process.cwd(), "src", "nexusChatViewProvider.ts"), "utf8");

    const posted: unknown[] = [];
    type Handler = (event: { key?: string; shiftKey?: boolean; preventDefault(): void; target?: FakeElement }) => void;
    class FakeElement {
        public value = "";
        public textContent = "";
        public placeholder = "";
        public dataset: Record<string, string> = {};
        public readonly handlers = new Map<string, Handler>();
        public readonly classList = { toggle: () => undefined };
        public addEventListener(type: string, handler: Handler): void { this.handlers.set(type, handler); }
        public setAttribute(): void {}
    }
    const elements = new Map(["transcript", "prompt", "send", "status", "contextKind", "attachments", "conversation", "quality", "qualityBar", "maxRounds", "attach", "regenerate", "newConversation"].map((id) => [id, new FakeElement()]));
    const modes = ["ask", "agent", "design", "loop"].map((mode) => {
        const button = new FakeElement();
        button.dataset.mode = mode;
        return button;
    });
    const context = vm.createContext({
        acquireVsCodeApi: () => ({ postMessage: (message: unknown) => posted.push(message) }),
        document: {
            getElementById: (id: string) => elements.get(id),
            querySelectorAll: (selector: string) => selector === "[data-mode]" ? modes : [],
        },
        window: { addEventListener: () => undefined },
    });

    new vm.Script(source).runInContext(context);
    assert.equal(JSON.stringify(posted), JSON.stringify([{ type: "ready" }]));
    assert.match(source, /activity-toggle/);
    assert.match(source, /requestAnimationFrame\(\(\) => \{ transcript\.scrollTop = transcript\.scrollHeight; \}\)/);
    assert.match(viewSource, /data-mode="design"/);
    assert.match(viewSource, /data-mode="loop"/);
    assert.match(viewSource, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(viewSource, /@media \(max-width: 330px\)/);

    modes[3].handlers.get("click")?.({ preventDefault: () => undefined });
    const promptInput = elements.get("prompt")!;
    promptInput.value = "Refine this implementation";
    elements.get("send")!.handlers.get("click")?.({ preventDefault: () => undefined });
    assert.equal((posted.at(-1) as { mode?: string }).mode, "loop");

    promptInput.value = "Send with Enter";
    let prevented = false;
    promptInput.handlers.get("keydown")?.({ key: "Enter", shiftKey: false, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal((posted.at(-1) as { prompt?: string }).prompt, "Send with Enter");

    const count = posted.length;
    promptInput.value = "Keep typing";
    prevented = false;
    promptInput.handlers.get("keydown")?.({ key: "Enter", shiftKey: true, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(posted.length, count);
});