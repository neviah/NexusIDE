import { CATALOG_PROVIDER_DEFINITIONS, createCatalogAdapter } from "./catalogProviders";
import { ProviderAdapter } from "./contracts";
import { createGroqAdapter, createOpenRouterAdapter } from "./openAiCompatible";
import { McpClient } from "./mcp";
import { HttpMcpTransport } from "./mcpTransport";
import { OllamaAdapter } from "./ollama";
import { formatSmokeReport, smokeProviders } from "./smoke";

const SMALL_MODEL_HINTS = ["8b", "9b", "mini", "small", "flash", "instant", "3b", "1b", "haiku", "nano"];

/**
 * Opt-in live check against real providers. Never part of the normal build: it needs network
 * access and real credentials, and it deliberately refuses anything that could bill the user.
 */
async function main(): Promise<number> {
    const env = process.env;
    const adapters: ProviderAdapter[] = [];
    const includeOllama = env.NEXUS_SMOKE_SKIP_OLLAMA !== "1";

    if (includeOllama) {
        adapters.push(new OllamaAdapter(env.OLLAMA_HOST ? { baseUrl: env.OLLAMA_HOST } : {}));
    }
    if (env.GROQ_API_KEY) {
        adapters.push(createGroqAdapter({ apiKey: async () => env.GROQ_API_KEY }));
    }
    if (env.OPENROUTER_API_KEY) {
        // The OpenRouter adapter admits only models currently priced at zero.
        adapters.push(createOpenRouterAdapter({ apiKey: async () => env.OPENROUTER_API_KEY }));
    }
    for (const definition of CATALOG_PROVIDER_DEFINITIONS) {
        const apiKey = env[definition.environmentKey];
        if (!apiKey) {
            continue;
        }
        if (definition.costClass !== "free-tier") {
            console.log(`  SKIP ${definition.displayName} - ${definition.costClass} routes are not exercised automatically`);
            continue;
        }
        adapters.push(createCatalogAdapter(definition, async () => apiKey));
    }

    console.log(`NexusIDE live smoke: ${adapters.length} provider(s) configured\n`);
    const report = await smokeProviders(adapters, {
        preferredModels: SMALL_MODEL_HINTS,
        timeoutMs: Number(env.NEXUS_SMOKE_TIMEOUT_MS ?? 30_000),
    });
    console.log(formatSmokeReport(report));

    const mcpOk = await smokeMcp(env.NEXUS_SMOKE_MCP_URL);
    return report.ok && mcpOk ? 0 : 1;
}

async function smokeMcp(url: string | undefined): Promise<boolean> {
    if (!url) {
        return true;
    }
    console.log(`\nMCP endpoint: ${url}`);
    const client = new McpClient(new HttpMcpTransport({ url }));
    try {
        const signal = AbortSignal.timeout(15_000);
        const identity = await client.initialize(signal);
        const tools = await client.listTools(signal);
        console.log(`  PASS ${identity.name ?? "server"} ${identity.version ?? ""} exposed ${tools.length} tool(s)`);
        console.log(tools.slice(0, 10).map((tool) => `      + ${tool.name}`).join("\n"));
        return tools.length > 0;
    } catch (error) {
        console.log(`  FAIL ${(error as Error).message}`);
        return false;
    } finally {
        await client.close().catch(() => undefined);
    }
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(`Live smoke crashed: ${(error as Error).message}`);
        process.exit(1);
    },
);
