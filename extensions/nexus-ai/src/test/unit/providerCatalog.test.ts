import assert from "node:assert/strict";
import test from "node:test";
import { PROVIDER_CATALOG, providerCatalogEntry } from "../../providerCatalog";

test("provider catalog keeps integrated routes distinct from discovery-only entries", () => {
    assert.equal(providerCatalogEntry("groq")?.integrated, true);
    assert.equal(providerCatalogEntry("gemini")?.integrated, false);
    assert.match(providerCatalogEntry("gemini")?.keyUrl ?? "", /^https:\/\//);
    assert.equal(new Set(PROVIDER_CATALOG.map(({ id }) => id)).size, PROVIDER_CATALOG.length);
});