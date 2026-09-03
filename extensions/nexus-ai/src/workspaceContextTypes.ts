export type ContextKind = "file" | "selection" | "symbols" | "diagnostics" | "definition" | "references" | "type" | "terminal" | "git-diff";

export interface ContextAttachment {
    id: string;
    kind: ContextKind;
    label: string;
    content: string;
}

export interface FormattedContext {
    content: string;
    usedChars: number;
    omittedAttachments: number;
}

export function formatContext(attachments: readonly ContextAttachment[], maximumChars = 30_000): string {
    return formatContextBudget(attachments, maximumChars).content;
}

export function formatContextBudget(attachments: readonly ContextAttachment[], maximumChars = 30_000): FormattedContext {
    let remaining = maximumChars;
    const sections: string[] = [];
    let included = 0;
    for (const attachment of attachments) {
        if (remaining <= 0) break;
        const separator = sections.length ? "\n\n" : "";
        const section = `${separator}### ${attachment.label} (${attachment.kind})\n${attachment.content}`.slice(0, remaining);
        sections.push(section);
        remaining -= section.length;
        included += 1;
    }
    const omittedAttachments = attachments.length - included;
    if (omittedAttachments && remaining > 0) {
        sections.push(`\n\n[${omittedAttachments} attachment(s) omitted by the context budget]`.slice(0, remaining));
    }
    const content = sections.join("");
    return { content, usedChars: content.length, omittedAttachments };
}