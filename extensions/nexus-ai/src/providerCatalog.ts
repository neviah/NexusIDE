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
    { id: "nvidia", name: "NVIDIA NIM", keyUrl: "https://build.nvidia.com/explore/discover", requirement: "Developer Program membership; permanent free rate limits", integrated: true },
    { id: "gemini", name: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey", requirement: "Google account; free-tier prompts may be used to improve Google products", integrated: true },
    { id: "github-models", name: "GitHub Models", keyUrl: "https://docs.github.com/en/rest/models/catalog", requirement: "Retired by GitHub on July 30, 2026", integrated: false },
    { id: "cerebras", name: "Cerebras", keyUrl: "https://cloud.cerebras.ai/", requirement: "Account; permanent free rate limits", integrated: true },
    { id: "mistral", name: "Mistral AI", keyUrl: "https://console.mistral.ai/api-keys", requirement: "Account; free experimental tier", integrated: true },
    { id: "huggingface", name: "Hugging Face", keyUrl: "https://huggingface.co/settings/tokens", requirement: "$0.10 monthly credits; credit-metered routes require explicit consent", integrated: true },
    { id: "sambanova", name: "SambaNova", keyUrl: "https://cloud.sambanova.ai/apis", requirement: "Account; free developer access subject to current service limits", integrated: true },
] as const;

export function providerCatalogEntry(providerId: string): ProviderCatalogEntry | undefined {
    return PROVIDER_CATALOG.find(({ id }) => id === providerId);
}