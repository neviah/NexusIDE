import { createHash, randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { requireCanonicalContainedPath, requireContainedPath } from "@nexus/ai-core";
import type {
    PermissionOption,
    ReadTextFileRequest,
    ReadTextFileResponse,
    RequestPermissionRequest,
    RequestPermissionResponse,
    WriteTextFileRequest,
    WriteTextFileResponse,
} from "@agentclientprotocol/sdk" with { "resolution-mode": "import" };
import { isDeniedAgentOperation, isReadOnlyUnityTool, requiresExplicitAgentApproval } from "./openCodeHarness";

const PREVIEW_SCHEME = "nexus-agent-before";

export class WorkspaceAgentHost implements vscode.Disposable {
    private readonly snapshots = new Map<string, string>();
    private readonly previews = new Map<string, string>();
    private readonly previewProvider: vscode.Disposable;
    private approvalSessionEnabled = false;
    private applyWritesSessionEnabled = false;

    public constructor() {
        this.previewProvider = vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
            provideTextDocumentContent: (uri) => this.previews.get(uri.path) ?? "",
        });
    }

    public dispose(): void {
        this.previewProvider.dispose();
        this.previews.clear();
        this.snapshots.clear();
    }

    public roots(): string[] {
        return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    }

    public assertReady(): string[] {
        if (!vscode.workspace.isTrusted) {
            throw new Error("Agent mode requires a trusted workspace.");
        }
        const roots = this.roots();
        if (roots.length === 0) {
            throw new Error("Open a workspace folder before starting Agent mode.");
        }
        return roots;
    }

    public async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        const roots = this.assertReady();
        const locations = params.toolCall.locations?.map((location) => location.path) ?? [];
        try {
            for (const location of locations) {
                await requireCanonicalContainedPath(location, roots);
            }
        } catch {
            return this.rejection(params.options);
        }

        const operation = `${params.toolCall.title ?? ""} ${JSON.stringify(params.toolCall.rawInput ?? "")}`;
        if (isDeniedAgentOperation(operation) || (this.isMutation(params) && this.hasDirtyWorkspaceDocument(locations))) {
            return this.rejection(params.options);
        }

        const allow = params.options.find((option) => option.kind === "allow_once");
        const reject = params.options.find((option) => option.kind === "reject_once" || option.kind === "reject_always");
        if (!allow) {
            return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
        }
        if (this.approvalSessionEnabled && !requiresExplicitAgentApproval(operation) && (!isMcpToolCall(params) || isReadOnlyUnityTool(params.toolCall.title))) {
            return { outcome: { outcome: "selected", optionId: allow.optionId } };
        }

        const detail = locations.length > 0 ? locations.join("\n") : operation;
        const selection = await vscode.window.showWarningMessage(
            params.toolCall.title ?? "OpenCode requests permission",
            { modal: true, detail },
            "Allow Once",
            "Allow This Session",
        );
        if (selection === "Allow Once") {
            return { outcome: { outcome: "selected", optionId: allow.optionId } };
        }
        if (selection === "Allow This Session") {
            this.approvalSessionEnabled = true;
            return { outcome: { outcome: "selected", optionId: allow.optionId } };
        }
        return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
    }

    public async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
        const filePath = await requireCanonicalContainedPath(params.path, this.assertReady());
        const content = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString("utf8");
        this.snapshots.set(filePath, digest(content));
        if (!params.line && !params.limit) {
            return { content };
        }
        const start = Math.max(0, (params.line ?? 1) - 1);
        const lines = content.split(/(?<=\n)/);
        return { content: lines.slice(start, params.limit ? start + params.limit : undefined).join("") };
    }

    public async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
        const filePath = await requireCanonicalContainedPath(params.path, this.assertReady());
        const uri = vscode.Uri.file(filePath);
        const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === filePath);
        if (openDocument?.isDirty) {
            throw new Error(`Refusing to overwrite an unsaved editor: ${filePath}`);
        }

        let previous = "";
        try {
            previous = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        } catch (error) {
            if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) {
                throw error;
            }
        }
        const snapshot = this.snapshots.get(filePath);
        if (snapshot && snapshot !== digest(previous)) {
            throw new Error(`Refusing to overwrite a file changed since the agent read it: ${filePath}`);
        }

        await this.previewDiff(filePath, previous, params.content);
        if (this.applyWritesSessionEnabled) {
            return await this.commitWrite(filePath, previous, params.content);
        }
        const choice = await vscode.window.showWarningMessage(
            `Apply changes to ${vscode.workspace.asRelativePath(uri)}?`,
            { modal: true, detail: "Review the open diff before applying this write." },
            "Apply",
            "Apply All Writes This Session",
        );
        if (choice !== "Apply" && choice !== "Apply All Writes This Session") {
            throw new Error(`Write denied: ${filePath}`);
        }
        if (choice === "Apply All Writes This Session") {
            this.applyWritesSessionEnabled = true;
        }
        return await this.commitWrite(filePath, previous, params.content);
    }

    private async commitWrite(filePath: string, previous: string, content: string): Promise<WriteTextFileResponse> {
        const finalPath = await requireCanonicalContainedPath(filePath, this.assertReady());
        const finalUri = vscode.Uri.file(finalPath);
        const finalDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === finalPath);
        if (finalDocument?.isDirty) {
            throw new Error(`Refusing to overwrite an editor that changed during review: ${finalPath}`);
        }
        let latest = "";
        try {
            latest = Buffer.from(await vscode.workspace.fs.readFile(finalUri)).toString("utf8");
        } catch (error) {
            if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) {
                throw error;
            }
        }
        if (latest !== previous) {
            throw new Error(`Refusing to overwrite a file changed during diff review: ${finalPath}`);
        }
        await vscode.workspace.fs.writeFile(finalUri, Buffer.from(content, "utf8"));
        this.snapshots.set(filePath, digest(content));
        return {};
    }

    public async previewDiff(filePath: string, oldText: string, newText: string): Promise<void> {
        const canonicalPath = await requireCanonicalContainedPath(filePath, this.assertReady());
        const beforePath = `/${randomUUID()}/before`;
        const afterPath = `/${randomUUID()}/after`;
        this.rememberPreview(beforePath, oldText);
        this.rememberPreview(afterPath, newText);
        await vscode.commands.executeCommand(
            "vscode.diff",
            vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: beforePath }),
            vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: afterPath }),
            `Agent changes: ${vscode.workspace.asRelativePath(canonicalPath)}`,
        );
    }

    private isMutation(params: RequestPermissionRequest): boolean {
        return params.toolCall.kind === "edit" || params.toolCall.kind === "delete" || params.toolCall.kind === "move";
    }

    private hasDirtyWorkspaceDocument(locations: readonly string[]): boolean {
        const dirty = vscode.workspace.textDocuments.filter((document) => document.isDirty && document.uri.scheme === "file");
        if (locations.length === 0) {
            return dirty.length > 0;
        }
        const targets = new Set(locations.map((location) => requireContainedPath(location, this.roots()).toLowerCase()));
        return dirty.some((document) => targets.has(document.uri.fsPath.toLowerCase()));
    }

    private rejection(options: readonly PermissionOption[]): RequestPermissionResponse {
        const reject = options.find((option) => option.kind === "reject_once" || option.kind === "reject_always");
        return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
    }

    private rememberPreview(previewPath: string, content: string): void {
        this.previews.set(previewPath, content);
        while (this.previews.size > 40) {
            const oldest = this.previews.keys().next().value;
            if (typeof oldest === "string") {
                this.previews.delete(oldest);
            }
        }
    }
}

function digest(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

function isMcpToolCall(params: RequestPermissionRequest): boolean {
    const title = params.toolCall.title ?? "";
    return /\b(?:unity|ai-game-developer)[_-]/i.test(title);
}