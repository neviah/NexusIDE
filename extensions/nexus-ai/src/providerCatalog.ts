export interface ProviderCatalogEntry {
    id: string;
    name: string;
    keyUrl?: string;
    requirement: string;
    integrated: boolean;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
    { id: "ollama", name: "Ollama", requirement: "Local installation; no API key", integrated: true },
    { id: "groq", name: "Groq", keyUrl: "https://console.groq.com/keys", requirement: "Account; no card for the free tier", integrated: true },
    { id: "openrouter", name: "OpenRouter", keyUrl: "https://openrouter.ai/keys", requirement: "Account; NexusIDE admits explicitly zero-priced models only", integrated: true },
    { id: "custom-openai", name: "Custom OpenAI-Compatible", requirement: "Local or self-hosted endpoint", integrated: true },
    { id: "nvidia", name: "NVIDIA NIM", keyUrl: "https://build.nvidia.com/", requirement: "Account and phone verification; adapter pending", integrated: false },
    { id: "gemini", name: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey", requirement: "Google account; adapter pending", integrated: false },
    { id: "github-models", name: "GitHub Models", keyUrl: "https://github.com/marketplace/models", requirement: "GitHub account; adapter pending", integrated: false },
    { id: "cerebras", name: "Cerebras", keyUrl: "https://cloud.cerebras.ai/", requirement: "Account; adapter pending", integrated: false },
    { id: "mistral", name: "Mistral AI", keyUrl: "https://console.mistral.ai/api-keys", requirement: "Account; adapter pending", integrated: false },
    { id: "huggingface", name: "Hugging Face", keyUrl: "https://huggingface.co/settings/tokens", requirement: "Account; credit-metered adapter pending", integrated: false },
    { id: "sambanova", name: "SambaNova", keyUrl: "https://cloud.sambanova.ai/apis", requirement: "Account; adapter pending", integrated: false },
] as const;

export function providerCatalogEntry(providerId: string): ProviderCatalogEntry | undefined {
    return PROVIDER_CATALOG.find(({ id }) => id === providerId);
}