import { realpath } from "node:fs/promises";
import path from "node:path";

export class WorkspacePathError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkspacePathError";
    }
}

export function requireContainedPath(candidate: string, roots: readonly string[]): string {
    if (roots.length === 0) {
        throw new WorkspacePathError("No workspace root is available.");
    }

    const pathApi = usesWindowsSyntax(candidate, roots) ? path.win32 : path.posix;
    rejectDevicePath(candidate);
    if (!pathApi.isAbsolute(candidate)) {
        throw new WorkspacePathError(`Path must be absolute: ${candidate}`);
    }

    const normalizedCandidate = pathApi.normalize(candidate);
    for (const root of roots) {
        rejectDevicePath(root);
        if (!pathApi.isAbsolute(root)) {
            throw new WorkspacePathError(`Workspace root must be absolute: ${root}`);
        }

        const normalizedRoot = trimTrailingSeparator(pathApi.normalize(root), pathApi.sep);
        const relative = pathApi.relative(normalizedRoot, normalizedCandidate);
        if (relative === "" || (!relative.startsWith(`..${pathApi.sep}`) && relative !== ".." && !pathApi.isAbsolute(relative))) {
            return normalizedCandidate;
        }
    }

    throw new WorkspacePathError(`Path is outside the workspace: ${candidate}`);
}

export async function requireCanonicalContainedPath(candidate: string, roots: readonly string[]): Promise<string> {
    const lexicalPath = requireContainedPath(candidate, roots);
    const pathApi = usesWindowsSyntax(candidate, roots) ? path.win32 : path.posix;
    const canonicalRoots = await Promise.all(roots.map((root) => canonicalize(root, pathApi)));
    const canonicalPath = await canonicalize(lexicalPath, pathApi);
    return requireContainedPath(canonicalPath, canonicalRoots);
}

function usesWindowsSyntax(candidate: string, roots: readonly string[]): boolean {
    return /^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\") || roots.some((root) => /^[a-zA-Z]:[\\/]/.test(root) || root.startsWith("\\\\"));
}

function rejectDevicePath(value: string): void {
    if (/^(?:\\\\[?.]\\|\\[?.]\\)/.test(value)) {
        throw new WorkspacePathError(`Device paths are not allowed: ${value}`);
    }
    if (/^[a-zA-Z]:[\\/]/.test(value)) {
        const withoutDrive = value.slice(2);
        if (withoutDrive.includes(":")) {
            throw new WorkspacePathError(`Alternate data streams are not allowed: ${value}`);
        }
        const hasReservedSegment = withoutDrive.split(/[\\/]/).some((segment) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment));
        if (hasReservedSegment) {
            throw new WorkspacePathError(`Reserved device paths are not allowed: ${value}`);
        }
    }
}

async function canonicalize(value: string, pathApi: typeof path.posix | typeof path.win32): Promise<string> {
    let existing = pathApi.normalize(value);
    const missingSegments: string[] = [];
    for (;;) {
        try {
            const canonical = await realpath(existing);
            return missingSegments.reduceRight((current, segment) => pathApi.join(current, segment), canonical);
        } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
                throw error;
            }
            const parent = pathApi.dirname(existing);
            if (parent === existing) {
                throw error;
            }
            missingSegments.push(pathApi.basename(existing));
            existing = parent;
        }
    }
}

function trimTrailingSeparator(value: string, separator: string): string {
    const parsed = path.parse(value);
    return value === parsed.root ? value : value.replace(new RegExp(`${escapeRegExp(separator)}+$`), "");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}