import { CATALOG_PROVIDER_DEFINITIONS, createCatalogAdapter, createCustomOpenAICompatibleAdapter, createGroqAdapter, createOpenRouterAdapter, OllamaAdapter, ProviderRegistry, SecretStore } from "@nexus/ai-core";
import * as vscode from "vscode";

const SECRET_PREFIX = "nexusAI.";
export const GROQ_API_KEY = "providers.groq.default.apiKey";
export const OPENROUTER_API_KEY = "providers.openrouter.default.apiKey";
export const CUSTOM_OPENAI_API_KEY = "providers.custom-openai.default.apiKey";

export { CATALOG_PROVIDER_DEFINITIONS };

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
        registry.register(createCatalogAdapter(provider, () => secretStore.get(provider.secretKey)));
    }
    registry.register(createCustomOpenAICompatibleAdapter({
        baseUrl: () => vscode.workspace.getConfiguration("nexusAI.customOpenAI").get("baseUrl", "http://127.0.0.1:1234/v1").trim(),
        displayName: "Custom OpenAI-Compatible",
        apiKey: () => secretStore.get(CUSTOM_OPENAI_API_KEY),
    }));
    return registry;
}
