import { CostClass, createCustomOpenAICompatibleAdapter, createGroqAdapter, createOpenRouterAdapter, OllamaAdapter, OpenAICompatibleAdapter, OpenAICompatibleModel, ProviderRegistry, SecretStore } from "@nexus/ai-core";
import * as vscode from "vscode";

const SECRET_PREFIX = "nexusAI.";
export const GROQ_API_KEY = "providers.groq.default.apiKey";
export const OPENROUTER_API_KEY = "providers.openrouter.default.apiKey";
export const CUSTOM_OPENAI_API_KEY = "providers.custom-openai.default.apiKey";

interface CatalogProviderDefinition {
    id: string;
    displayName: string;
    baseUrl: string;
    costClass: CostClass;
    secretKey: string;
    environmentKey: string;
    modelsPath?: string;
    modelsFormat?: "gemini";
    apiKeyHeader?: string;
}

export const CATALOG_PROVIDER_DEFINITIONS: readonly CatalogProviderDefinition[] = [
    { id: "nvidia", displayName: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", costClass: "free-tier", secretKey: "providers.nvidia.default.apiKey", environmentKey: "NVIDIA_API_KEY" },
    { id: "gemini", displayName: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelsPath: "https://generativelanguage.googleapis.com/v1beta/models", modelsFormat: "gemini", apiKeyHeader: "x-goog-api-key", costClass: "free-tier", secretKey: "providers.gemini.default.apiKey", environmentKey: "GEMINI_API_KEY" },
    { id: "cerebras", displayName: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", costClass: "free-tier", secretKey: "providers.cerebras.default.apiKey", environmentKey: "CEREBRAS_API_KEY" },
    { id: "mistral", displayName: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", costClass: "free-tier", secretKey: "providers.mistral.default.apiKey", environmentKey: "MISTRAL_API_KEY" },
    { id: "huggingface", displayName: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", costClass: "trial", secretKey: "providers.huggingface.default.apiKey", environmentKey: "HF_TOKEN" },
    { id: "sambanova", displayName: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", costClass: "trial", secretKey: "providers.sambanova.default.apiKey", environmentKey: "SAMBANOVA_API_KEY" },
] as const;

export class NexusSecretStore implements SecretStore {
    public constructor(private readonly secrets: vscode.SecretStorage) {}

    public async get(key: string): Promise<string | undefined> {
        return await this.secrets.get(SECRET_PREFIX + key);
    }

    public async set(key: string, value: string): Promise<void> {
        await this.secrets.store(SECRET_PREFIX + key, value);
    }

    public async delete(key: string): Promise<void> {
        await this.secrets.delete(SECRET_PREFIX + key);
    }
}

export function createProviderRegistry(secretStore: NexusSecretStore): ProviderRegistry {
    const registry = new ProviderRegistry();
    registry.register(new OllamaAdapter());
    registry.register(createOpenRouterAdapter({ apiKey: () => secretStore.get(OPENROUTER_API_KEY) }));
    registry.register(createGroqAdapter({ apiKey: () => secretStore.get(GROQ_API_KEY) }));
    for (const provider of CATALOG_PROVIDER_DEFINITIONS) {
        registry.register(new OpenAICompatibleAdapter({
            id: provider.id,
            displayName: provider.displayName,
            baseUrl: provider.baseUrl,
            costClass: provider.costClass,
            apiKey: () => secretStore.get(provider.secretKey),
            apiKeyHeader: provider.apiKeyHeader,
            modelsPath: provider.modelsPath,
            extractModels: provider.modelsFormat === "gemini" ? extractGeminiModels : undefined,
            supportsTools: true,
            supportsStructuredOutput: true,
        }));
    }
    registry.register(createCustomOpenAICompatibleAdapter({
        baseUrl: () => vscode.workspace.getConfiguration("nexusAI.customOpenAI").get("baseUrl", "http://127.0.0.1:1234/v1").trim(),
        displayName: "Custom OpenAI-Compatible",
        apiKey: () => secretStore.get(CUSTOM_OPENAI_API_KEY),
    }));
    return registry;
}

function extractGeminiModels(payload: unknown): readonly OpenAICompatibleModel[] {
    if (!payload || typeof payload !== "object" || !("models" in payload) || !Array.isArray(payload.models)) return [];
    return (payload.models as OpenAICompatibleModel[]).flatMap((model) => {
        const id = model.name?.replace(/^models\//, "");
        return id && model.supportedGenerationMethods?.includes("generateContent") ? [{ ...model, id }] : [];
    });
}