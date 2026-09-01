import { ProviderAdapter } from "./contracts";

export class ProviderRegistry {
    private readonly adapters = new Map<string, ProviderAdapter>();

    public register(adapter: ProviderAdapter): void {
        const id = adapter.manifest().id;
        if (this.adapters.has(id)) {
            throw new Error(`Provider '${id}' is already registered.`);
        }
        this.adapters.set(id, adapter);
    }

    public get(id: string): ProviderAdapter | undefined {
        return this.adapters.get(id);
    }

    public list(): readonly ProviderAdapter[] {
        return [...this.adapters.values()];
    }
}