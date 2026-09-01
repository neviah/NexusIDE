import { createGroqAdapter, OllamaAdapter, ProviderRegistry, SecretStore } from "@nexus/ai-core";
import * as vscode from "vscode";

const SECRET_PREFIX = "nexusAI.";
export const GROQ_API_KEY = "providers.groq.default.apiKey";

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
    registry.register(createGroqAdapter({ apiKey: () => secretStore.get(GROQ_API_KEY) }));
    return registry;
}