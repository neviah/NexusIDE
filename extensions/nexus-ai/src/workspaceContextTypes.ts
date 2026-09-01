export type ContextKind = "file" | "selection" | "symbols" | "diagnostics" | "terminal" | "git-diff";

export interface ContextAttachment {
    id: string;
    kind: ContextKind;
    label: string;
    content: string;
}

export function formatContext(attachments: readonly ContextAttachment[], maximumChars = 30_000): string {
    let remaining = maximumChars;
    const sections: string[] = [];
    for (const attachment of attachments) {
        if (remaining <= 0) break;
        const separator = sections.length ? "\n\n" : "";
        const section = `${separator}### ${attachment.label} (${attachment.kind})\n${attachment.content}`.slice(0, remaining);
        sections.push(section);
        remaining -= section.length;
    }
    return sections.join("");
}