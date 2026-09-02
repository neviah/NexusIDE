import { CostClass, ModelDescriptor, ProviderAdapter, SecretStore } from "./contracts";
import { normalizeError } from "./errors";

/** Only these classes may be exercised. Trial, mixed, and paid routes can bill the user. */
export const SMOKE_ALLOWED_COST_CLASSES: readonly CostClass[] = ["local", "free-tier"];

export const SMOKE_PROMPT = "Reply with the single word: ready";

export interface SmokeCheck {
    name: string;
    ok: boolean;
    detail: string;
}

export interface SmokeResult {
    providerId: string;
    displayName: string;
    outcome: "passed" | "failed" | "skipped";
    modelId?: string;
    reason?: string;
    durationMs: number;
    checks: readonly SmokeCheck[];
}

export interface SmokeReport {
    startedAt: string;
    durationMs: number;
    results: readonly SmokeResult[];
    passed: number;
    failed: number;
    skipped: number;
    ok: boolean;
}

export interface SmokeOptions {
    /** Prefer small models so a live run stays cheap and fast. */
    preferredModels?: readonly string[];
    maxOutputTokens?: number;
    timeoutMs?: number;
    now?: () => number;
    signal?: AbortSignal;
}

const emptySecrets: SecretStore = {
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
};

export function selectSmokeModel(models: readonly ModelDescriptor[], preferred: readonly string[] = []): ModelDescriptor | undefined {
    const eligible = models.filter((model) => SMOKE_ALLOWED_COST_CLASSES.includes(model.costClass));
    for (const hint of preferred) {
        const match = eligible.find((model) => model.id.toLowerCase().includes(hint.toLowerCase()));
        if (match) {
            return match;
        }
    }
    return eligible[0];
}

/**
 * Exercises one provider end to end: credentials, health, discovery, and a real streamed
 * completion. A provider without credentials is skipped rather than failed, so an unconfigured
 * machine reports honestly instead of reporting a broken integration.
 */
export async function smokeProvider(adapter: ProviderAdapter, options: SmokeOptions = {}): Promise<SmokeResult> {
    const now = options.now ?? Date.now;
    const started = now();
    const manifest = adapter.manifest();
    const checks: SmokeCheck[] = [];
    const finish = (outcome: SmokeResult["outcome"], extra: Partial<SmokeResult> = {}): SmokeResult =>
        ({ providerId: manifest.id, displayName: manifest.displayName, outcome, durationMs: now() - started, checks, ...extra });

    try {
        const authentication = await adapter.authenticate(emptySecrets);
        if (!authentication.authenticated) {
            return finish("skipped", { reason: "No credentials configured" });
        }
        checks.push({ name: "authenticate", ok: true, detail: "credentials accepted" });

        const health = await adapter.health(timeout(options));
        checks.push({ name: "health", ok: health.status !== "unavailable", detail: `${health.status}${health.latencyMs === undefined ? "" : ` in ${health.latencyMs}ms`}` });
        if (health.status === "unavailable") {
            return finish("failed", { reason: health.message ?? "Provider unavailable" });
        }

        const models = await adapter.listModels(timeout(options));
        const model = selectSmokeModel(models, options.preferredModels);
        checks.push({ name: "discover", ok: Boolean(model), detail: `${models.length} model(s), ${models.filter((entry) => SMOKE_ALLOWED_COST_CLASSES.includes(entry.costClass)).length} no-cost` });
        if (!model) {
            return finish("skipped", { reason: "No local or free-tier model offered" });
        }
        // Defence in depth: selection already filters, but never stream a billable route.
        if (!SMOKE_ALLOWED_COST_CLASSES.includes(model.costClass)) {
            return finish("skipped", { reason: `Refusing billable route (${model.costClass})`, modelId: model.id });
        }

        const stream = adapter.stream({
            model: model.id,
            messages: [{ role: "user", content: SMOKE_PROMPT }],
            maxOutputTokens: options.maxOutputTokens ?? 16,
            temperature: 0,
        }, timeout(options));

        let text = "";
        let completed = false;
        for await (const event of stream) {
            if (event.type === "text-delta") {
                text += event.text;
            }
            if (event.type === "done") {
                completed = true;
            }
        }
        const produced = text.trim().length > 0;
        checks.push({ name: "stream", ok: produced, detail: produced ? `${text.trim().slice(0, 40)}` : "no text produced" });
        checks.push({ name: "complete", ok: completed, detail: completed ? "stream terminated" : "stream ended without completion" });

        return produced && completed
            ? finish("passed", { modelId: model.id })
            : finish("failed", { modelId: model.id, reason: produced ? "Stream did not complete" : "Provider produced no text" });
    } catch (error) {
        const normalized = normalizeError(error, manifest.id);
        checks.push({ name: "error", ok: false, detail: normalized.message });
        return finish("failed", { reason: normalized.message });
    }
}

export async function smokeProviders(adapters: readonly ProviderAdapter[], options: SmokeOptions = {}): Promise<SmokeReport> {
    const now = options.now ?? Date.now;
    const started = now();
    const results: SmokeResult[] = [];
    for (const adapter of adapters) {
        results.push(await smokeProvider(adapter, options));
    }
    const count = (outcome: SmokeResult["outcome"]) => results.filter((result) => result.outcome === outcome).length;
    const passed = count("passed");
    const failed = count("failed");
    return {
        startedAt: new Date(started).toISOString(),
        durationMs: now() - started,
        results,
        passed,
        failed,
        skipped: count("skipped"),
        // A run with nothing configured is not a pass; it has proven nothing.
        ok: failed === 0 && passed > 0,
    };
}

export function formatSmokeReport(report: SmokeReport): string {
    const lines = report.results.map((result) => {
        const mark = result.outcome === "passed" ? "PASS" : result.outcome === "failed" ? "FAIL" : "SKIP";
        const model = result.modelId ? ` [${result.modelId}]` : "";
        const reason = result.reason ? ` - ${result.reason}` : "";
        const detail = result.checks.map((check) => `      ${check.ok ? "+" : "!"} ${check.name}: ${check.detail}`).join("\n");
        return `  ${mark} ${result.displayName}${model}${reason} (${result.durationMs}ms)${detail ? `\n${detail}` : ""}`;
    });
    const summary = `${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped in ${report.durationMs}ms`;
    return [...lines, "", summary, report.ok ? "Live smoke passed." : report.passed === 0 && report.failed === 0 ? "No provider was configured; nothing was proven." : "Live smoke failed."].join("\n");
}

function timeout(options: SmokeOptions): AbortSignal {
    const budget = AbortSignal.timeout(options.timeoutMs ?? 30_000);
    return options.signal ? AbortSignal.any([budget, options.signal]) : budget;
}
