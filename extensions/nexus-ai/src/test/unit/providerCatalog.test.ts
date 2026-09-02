import assert from "node:assert/strict";
import test from "node:test";
import { PROVIDER_CATALOG, providerCatalogEntry } from "../../providerCatalog";

test("provider catalog exposes integrations and identifies retired providers", () => {
    const providers = ["ollama", "groq", "openrouter", "custom-openai", "nvidia", "gemini", "github-models", "cerebras", "mistral", "huggingface", "sambanova"];
    assert.deepEqual(PROVIDER_CATALOG.map(({ id }) => id), providers);
    assert.equal(PROVIDER_CATALOG.filter(({ integrated }) => !integrated).length, 1);
    assert.equal(providerCatalogEntry("github-models")?.integrated, false);
    assert.match(providerCatalogEntry("github-models")?.requirement ?? "", /Retired/);
    assert.match(providerCatalogEntry("gemini")?.keyUrl ?? "", /^https:\/\//);
    assert.equal(new Set(PROVIDER_CATALOG.map(({ id }) => id)).size, PROVIDER_CATALOG.length);
});