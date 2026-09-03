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

/** Keeps an in-memory, run-scoped before-image for writes mediated by NexusIDE. */
export class WorkspaceCheckpointStore {
    private readonly checkpoints = new Map<string, { createdAt: string; files: Map<string, CheckpointFile> }>();
    private activeId?: string;

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
        return checkpoint ? { id, createdAt: checkpoint.createdAt, files: [...checkpoint.files.values()] } : undefined;
    }

    public get(id: string): WorkspaceCheckpoint | undefined {
        const checkpoint = this.checkpoints.get(id);
        return checkpoint ? { id, createdAt: checkpoint.createdAt, files: [...checkpoint.files.values()] } : undefined;
    }

    public discard(id: string): void {
        this.checkpoints.delete(id);
        if (this.activeId === id) this.activeId = undefined;
    }
}

export function contentDigest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}
