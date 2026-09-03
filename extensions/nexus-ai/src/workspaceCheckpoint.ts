import { createHash, randomUUID } from "node:crypto";

export interface CheckpointFile {
    path: string;
    before?: string;
    after: string;
}

export interface WorkspaceCheckpoint {
    id: string;
    createdAt: string;
    files: readonly CheckpointFile[];
}

export interface CheckpointStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

const STORAGE_KEY = "nexusAI.agent.checkpoints.v1";

/** Keeps a bounded workspace-scoped journal for writes mediated by NexusIDE. */
export class WorkspaceCheckpointStore {
    private readonly checkpoints = new Map<string, { createdAt: string; files: Map<string, CheckpointFile> }>();
    private activeId?: string;

    public constructor(private readonly storage?: CheckpointStorage, private readonly maximumCheckpoints = 3) {
        const persisted = this.storage?.get<unknown>(STORAGE_KEY, []);
        for (const checkpoint of Array.isArray(persisted) ? persisted : []) {
            if (!isCheckpoint(checkpoint)) continue;
            this.checkpoints.set(checkpoint.id, { createdAt: checkpoint.createdAt, files: new Map(checkpoint.files.map((file) => [file.path, file])) });
        }
    }

    public begin(): string {
        const id = randomUUID();
        this.checkpoints.set(id, { createdAt: new Date().toISOString(), files: new Map() });
        this.activeId = id;
        return id;
    }

    public capture(path: string, before: string | undefined, after: string): void {
        const checkpoint = this.activeId ? this.checkpoints.get(this.activeId) : undefined;
        if (!checkpoint) return;
        const existing = checkpoint.files.get(path);
        checkpoint.files.set(path, { path, before: existing?.before ?? before, after });
    }

    public finish(id: string): WorkspaceCheckpoint | undefined {
        if (this.activeId === id) this.activeId = undefined;
        const checkpoint = this.checkpoints.get(id);
        if (checkpoint) {
            this.checkpoints.delete(id);
            this.checkpoints.set(id, checkpoint);
        }
        const result = checkpoint ? { id, createdAt: checkpoint.createdAt, files: [...checkpoint.files.values()] } : undefined;
        this.persist();
        return result;
    }

    public get(id: string): WorkspaceCheckpoint | undefined {
        const checkpoint = this.checkpoints.get(id);
        return checkpoint ? { id, createdAt: checkpoint.createdAt, files: [...checkpoint.files.values()] } : undefined;
    }

    public discard(id: string): void {
        this.checkpoints.delete(id);
        if (this.activeId === id) this.activeId = undefined;
        this.persist();
    }

    private persist(): void {
        const entries = [...this.checkpoints.entries()]
            .reverse()
            .slice(0, this.maximumCheckpoints);
        const retained = new Set(entries.map(([id]) => id));
        for (const id of this.checkpoints.keys()) {
            if (!retained.has(id) && id !== this.activeId) this.checkpoints.delete(id);
        }
        void this.storage?.update(STORAGE_KEY, entries.map(([id, checkpoint]) => ({
            id,
            createdAt: checkpoint.createdAt,
            files: [...checkpoint.files.values()],
        })));
    }
}

function isCheckpoint(value: unknown): value is WorkspaceCheckpoint {
    return Boolean(value) && typeof value === "object" && typeof (value as WorkspaceCheckpoint).id === "string"
        && typeof (value as WorkspaceCheckpoint).createdAt === "string" && Array.isArray((value as WorkspaceCheckpoint).files)
        && (value as WorkspaceCheckpoint).files.every((file) => file && typeof file.path === "string" && typeof file.after === "string" && (file.before === undefined || typeof file.before === "string"));
}

export function contentDigest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}
