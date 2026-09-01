import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { ContextAttachment, ContextKind } from "./workspaceContextTypes";

const MAX_ATTACHMENT_CHARS = 12_000;

export class WorkspaceContextCollector {
    private nextId = 0;

    public async collect(kind: ContextKind): Promise<ContextAttachment> {
        const result = kind === "terminal" ? await this.terminalSelection()
            : kind === "git-diff" ? await this.gitDiff()
            : await this.editorContext(kind);
        return { id: `${Date.now()}-${this.nextId++}`, kind, label: result.label, content: truncate(result.content) };
    }

    private async editorContext(kind: Exclude<ContextKind, "terminal" | "git-diff">): Promise<{ label: string; content: string }> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error("Open a file before attaching editor context.");
        }
        const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
        if (kind === "file") {
            return { label: relative, content: editor.document.getText() };
        }
        if (kind === "selection") {
            const content = editor.document.getText(editor.selection);
            if (!content) {
                throw new Error("Select text in the active editor first.");
            }
            return { label: `${relative} selection`, content };
        }
        if (kind === "diagnostics") {
            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
            return {
                label: `${relative} diagnostics`,
                content: diagnostics.length ? diagnostics.map((item) => `${item.range.start.line + 1}:${item.range.start.character + 1} ${severity(item.severity)} ${item.message}`).join("\n") : "No diagnostics.",
            };
        }
        const symbols = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", editor.document.uri) ?? [];
        return { label: `${relative} symbols`, content: formatSymbols(symbols) || "No document symbols." };
    }

    private async terminalSelection(): Promise<{ label: string; content: string }> {
        if (!vscode.window.activeTerminal) {
            throw new Error("Open a terminal and select output first.");
        }
        await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
        const content = await vscode.env.clipboard.readText();
        if (!content.trim()) {
            throw new Error("Select terminal output before attaching it.");
        }
        return { label: `${vscode.window.activeTerminal.name} output`, content };
    }

    private async gitDiff(): Promise<{ label: string; content: string }> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder || folder.uri.scheme !== "file") {
            throw new Error("Open a local workspace before attaching a Git diff.");
        }
        const content = await runGitDiff(folder.uri.fsPath);
        return { label: "Workspace Git diff", content: content.trim() || "No tracked changes." };
    }
}

function formatSymbols(symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[], depth = 0): string {
    return symbols.map((symbol) => {
        const range = "location" in symbol ? symbol.location.range : symbol.range;
        const line = `${"  ".repeat(depth)}${symbol.name} (${vscode.SymbolKind[symbol.kind]}) line ${range.start.line + 1}`;
        return "children" in symbol && symbol.children.length ? `${line}\n${formatSymbols(symbol.children, depth + 1)}` : line;
    }).join("\n");
}

function runGitDiff(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => execFile("git", ["diff", "HEAD", "--no-ext-diff", "--"], { cwd, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}

function truncate(value: string): string {
    return value.length <= MAX_ATTACHMENT_CHARS ? value : `${value.slice(0, MAX_ATTACHMENT_CHARS)}\n[Attachment truncated]`;
}

function severity(value: vscode.DiagnosticSeverity): string {
    return value === vscode.DiagnosticSeverity.Error ? "Error" : value === vscode.DiagnosticSeverity.Warning ? "Warning" : value === vscode.DiagnosticSeverity.Information ? "Info" : "Hint";
}