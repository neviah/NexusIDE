import { readFile } from "node:fs/promises";
import path from "node:path";

const MAX_INSTRUCTION_CHARS = 12_000;

export interface WorkspaceInstruction {
    path: string;
    content: string;
}

/** Reads project-owned instructions without treating arbitrary workspace files as agent policy. */
export async function loadWorkspaceInstructions(roots: readonly string[]): Promise<readonly WorkspaceInstruction[]> {
    const files = await Promise.all(roots.map(async (root) => {
        const instructionPath = path.join(root, "AGENTS.md");
        try {
            return { path: instructionPath, content: await readFile(instructionPath, "utf8") };
        } catch {
            return undefined;
        }
    }));
    return files.filter((file): file is WorkspaceInstruction => Boolean(file));
}

export function formatWorkspaceInstructions(instructions: readonly WorkspaceInstruction[], maximumChars = MAX_INSTRUCTION_CHARS): string {
    let remaining = maximumChars;
    const sections: string[] = [];
    for (const instruction of instructions) {
        if (remaining <= 0) break;
        const header = `### ${instruction.path}\n`;
        const marker = "\n[Instructions truncated]";
        const available = Math.max(0, remaining - header.length);
        const truncated = instruction.content.length > available;
        const content = instruction.content.slice(0, truncated ? Math.max(0, available - marker.length) : available);
        const section = `${header}${content}${truncated ? marker : ""}`.slice(0, remaining);
        sections.push(section);
        remaining -= section.length;
    }
    return sections.join("\n\n");
}
