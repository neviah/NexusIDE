const STORAGE_KEY = "nexusAI.router.stack.v1";

export interface RouteStackStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

export class RouteStackStore {
    private readonly listeners = new Set<() => void>();

    public constructor(private readonly storage: RouteStackStorage) {}

    public load(): readonly string[] {
        const value = this.storage.get<unknown>(STORAGE_KEY, []);
        return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
    }

    public async save(routes: readonly string[]): Promise<void> {
        await this.storage.update(STORAGE_KEY, [...new Set(routes)]);
        for (const listener of this.listeners) listener();
    }

    public onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
}