import { CostClass } from "./contracts";
import { OpenAICompatibleAdapter, OpenAICompatibleModel } from "./openAiCompatible";

export interface CatalogProviderDefinition {
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

/**
 * Single source of truth for catalog providers, shared by the extension runtime and the live
 * smoke harness so a corrected endpoint can never be fixed in one place and stale in the other.
 */
export const CATALOG_PROVIDER_DEFINITIONS: readonly CatalogProviderDefinition[] = [
    { id: "nvidia", displayName: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", costClass: "free-tier", secretKey: "providers.nvidia.default.apiKey", environmentKey: "NVIDIA_API_KEY" },
    { id: "gemini", displayName: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelsPath: "https://generativelanguage.googleapis.com/v1beta/models", modelsFormat: "gemini", apiKeyHeader: "x-goog-api-key", costClass: "free-tier", secretKey: "providers.gemini.default.apiKey", environmentKey: "GEMINI_API_KEY" },
    { id: "cerebras", displayName: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", costClass: "free-tier", secretKey: "providers.cerebras.default.apiKey", environmentKey: "CEREBRAS_API_KEY" },
    { id: "mistral", displayName: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", costClass: "free-tier", secretKey: "providers.mistral.default.apiKey", environmentKey: "MISTRAL_API_KEY" },
    { id: "huggingface", displayName: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", costClass: "trial", secretKey: "providers.huggingface.default.apiKey", environmentKey: "HF_TOKEN" },
    { id: "sambanova", displayName: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", costClass: "trial", secretKey: "providers.sambanova.default.apiKey", environmentKey: "SAMBANOVA_API_KEY" },
] as const;

export function createCatalogAdapter(definition: CatalogProviderDefinition, apiKey: () => Promise<string | undefined>): OpenAICompatibleAdapter {
    return new OpenAICompatibleAdapter({
        id: definition.id,
        displayName: definition.displayName,
        baseUrl: definition.baseUrl,
        costClass: definition.costClass,
        apiKey,
        apiKeyHeader: definition.apiKeyHeader,
        modelsPath: definition.modelsPath,
        extractModels: definition.modelsFormat === "gemini" ? extractGeminiModels : undefined,
        supportsTools: true,
        supportsStructuredOutput: true,
    });
}

export function extractGeminiModels(payload: unknown): readonly OpenAICompatibleModel[] {
    if (!payload || typeof payload !== "object" || !("models" in payload) || !Array.isArray(payload.models)) {
        return [];
    }
    return (payload.models as OpenAICompatibleModel[]).flatMap((model) => {
        const id = model.name?.replace(/^models\//, "");
        return id && model.supportedGenerationMethods?.includes("generateContent") ? [{ ...model, id }] : [];
    });
}
