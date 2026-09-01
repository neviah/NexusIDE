import assert from "node:assert/strict";
import test from "node:test";
import { buildSupportDiagnostics, redactDiagnostics } from "../../supportDiagnostics";

test("support diagnostics contain operational state without sensitive values", () => {
    const report = buildSupportDiagnostics({
        generatedAt: "2026-09-01T00:00:00.000Z",
        nexusAIVersion: "0.1.0",
        vscodeVersion: "1.136.0",
        platform: "win32",
        architecture: "x64",
        workspaceTrusted: true,
        workspaceFolderCount: 2,
        recoveryDetected: false,
        providerHealth: {
            groq: { status: "limited", authorization: "Bearer private-token" },
        },
        logDirectories: ["logs"],
    });

    assert.equal(report.schemaVersion, 1);
    assert.deepEqual((report.providerHealth as Record<string, unknown>).groq, {
        status: "limited",
        authorization: "[redacted]",
    });
});

test("recursive redaction removes credential fields and token-shaped values", () => {
    assert.deepEqual(redactDiagnostics({
        apiKey: "gsk-privatevalue",
        nested: { prompt: "private source", message: "Bearer abc.def.ghi" },
    }), {
        apiKey: "[redacted]",
        nested: { prompt: "[redacted]", message: "Bearer [redacted]" },
    });
});