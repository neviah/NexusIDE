const STORAGE_KEY = "nexusAI.lifecycle.v1";

export interface LifecycleStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

interface LifecycleState {
    cleanShutdown: boolean;
    startedAt?: string;
}

export class StartupRecovery {
    private recoveryDetected = false;

    public constructor(private readonly storage: LifecycleStorage) {}

    public async begin(now = new Date().toISOString()): Promise<boolean> {
        const previous = this.storage.get<unknown>(STORAGE_KEY, { cleanShutdown: true });
        this.recoveryDetected = isLifecycleState(previous) && previous.cleanShutdown === false;
        await this.storage.update(STORAGE_KEY, { cleanShutdown: false, startedAt: now });
        return this.recoveryDetected;
    }

    public detected(): boolean {
        return this.recoveryDetected;
    }

    public async markClean(): Promise<void> {
        await this.storage.update(STORAGE_KEY, { cleanShutdown: true });
    }
}

function isLifecycleState(value: unknown): value is LifecycleState {
    return Boolean(value) && typeof value === "object" && typeof (value as Partial<LifecycleState>).cleanShutdown === "boolean";
}