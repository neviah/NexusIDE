import assert from "node:assert/strict";
import test from "node:test";
import { LifecycleStorage, StartupRecovery } from "../../startupRecovery";

test("startup recovery detects an unclean prior session and returns to clean state", async () => {
    const memory = memoryStorage({ cleanShutdown: false, startedAt: "2026-08-31T00:00:00.000Z" });
    const recovery = new StartupRecovery(memory.storage);
    assert.equal(await recovery.begin("2026-09-01T00:00:00.000Z"), true);
    assert.equal(recovery.detected(), true);
    assert.deepEqual(memory.value(), { cleanShutdown: false, startedAt: "2026-09-01T00:00:00.000Z" });
    await recovery.markClean();
    assert.deepEqual(memory.value(), { cleanShutdown: true });
});

test("malformed lifecycle state fails closed without claiming a crash", async () => {
    const memory = memoryStorage("invalid");
    const recovery = new StartupRecovery(memory.storage);
    assert.equal(await recovery.begin(), false);
});

function memoryStorage(initial: unknown): { storage: LifecycleStorage; value: () => unknown } {
    let state = initial;
    return {
        storage: {
            get: <T>(_key: string, fallback: T) => (state ?? fallback) as T,
            update: async (_key: string, value: unknown) => { state = value; },
        },
        value: () => state,
    };
}