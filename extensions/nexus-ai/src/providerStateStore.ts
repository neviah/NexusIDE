import { ProviderHealth, ProviderQuota, RouteFailureObservation, RouteQuotaObservation } from "@nexus/ai-core";

const STORAGE_KEY = "nexusAI.providers.state.v1";

export interface ProviderStateStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

export interface ProviderSettings {
    enabled: boolean;
    quotaNote?: string;
    health?: ProviderHealth;
    smoke?: { checkedAt: string; outcome: "passed" | "failed" | "skipped"; message: string };
}

export interface RouteRuntimeState {
    cooldownUntil?: string;
    quota?: ProviderQuota;
}

interface StoredProviderState {
    enabled?: boolean;
    quotaNote?: string;
    health?: ProviderHealth;
    smoke?: ProviderSettings["smoke"];
}

interface ProviderStateDocument {
    providers: Record<string, StoredProviderState>;
    routes: Record<string, RouteRuntimeState>;
}

export class ProviderStateStore {
    public constructor(private readonly storage: ProviderStateStorage) {}

    public provider(providerId: string): ProviderSettings {
        const state = this.read().providers[providerId];
        return { enabled: state?.enabled !== false, quotaNote: state?.quotaNote, health: state?.health, ...(state?.smoke ? { smoke: state.smoke } : {}) };
    }

    public has(providerId: string): boolean {
        return Object.hasOwn(this.read().providers, providerId);
    }

    public route(providerId: string, modelId: string, now = Date.now()): RouteRuntimeState {
        const state = this.read().routes[routeKey(providerId, modelId)];
        const quotaExpired = state?.quota?.resetsAt !== undefined && Date.parse(state.quota.resetsAt) <= now;
        return {
            quota: quotaExpired ? undefined : state?.quota,
            cooldownUntil: state?.cooldownUntil && Date.parse(state.cooldownUntil) > now ? state.cooldownUntil : undefined,
        };
    }

    public async configure(providerId: string, enabled: boolean, quotaNote?: string): Promise<void> {
        const document = this.read();
        document.providers[providerId] = {
            ...document.providers[providerId],
            enabled,
            quotaNote: quotaNote?.trim() || undefined,
        };
        await this.storage.update(STORAGE_KEY, document);
    }

    public async recordHealth(providerId: string, health: ProviderHealth): Promise<void> {
        const document = this.read();
        document.providers[providerId] = { ...document.providers[providerId], health };
        await this.storage.update(STORAGE_KEY, document);
    }

    public async recordSmoke(providerId: string, outcome: "passed" | "failed" | "skipped", message: string): Promise<void> {
        const document = this.read();
        document.providers[providerId] = { ...document.providers[providerId], smoke: { checkedAt: new Date().toISOString(), outcome, message: message.slice(0, 240) } };
        await this.storage.update(STORAGE_KEY, document);
    }

    public async recordFailure(observation: RouteFailureObservation): Promise<void> {
        if (!observation.cooldownUntil) return;
        const document = this.read();
        const key = routeKey(observation.providerId, observation.modelId);
        document.routes[key] = {
            ...document.routes[key],
            cooldownUntil: observation.cooldownUntil,
            quota: {
                status: "limited",
                observedAt: observation.observedAt,
                resetsAt: observation.cooldownUntil,
            },
        };
        await this.storage.update(STORAGE_KEY, document);
    }

    public async recordQuota(observation: RouteQuotaObservation): Promise<void> {
        const document = this.read();
        const key = routeKey(observation.providerId, observation.modelId);
        document.routes[key] = { ...document.routes[key], quota: observation.quota };
        await this.storage.update(STORAGE_KEY, document);
    }

    private read(): ProviderStateDocument {
        const value = this.storage.get<unknown>(STORAGE_KEY, {});
        if (!value || typeof value !== "object") return { providers: {}, routes: {} };
        const document = value as Partial<ProviderStateDocument>;
        return {
            providers: document.providers && typeof document.providers === "object" ? { ...document.providers } : {},
            routes: document.routes && typeof document.routes === "object" ? { ...document.routes } : {},
        };
    }
}

function routeKey(providerId: string, modelId: string): string {
    return `${providerId}/${modelId}`;
}
