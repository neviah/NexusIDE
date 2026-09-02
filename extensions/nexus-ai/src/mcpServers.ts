import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { McpServerDefinition } from "@nexus/ai-core";
import { mergeUnityPreset, parseServerDefinitions, parseWorkspaceMcpDocument, UNITY_DEFAULT_URL } from "./mcpServerDefinitions";

export * from "./mcpServerDefinitions";

export function readServerDefinitions(): readonly McpServerDefinition[] {
    const configuration = vscode.workspace.getConfiguration("nexusAI.mcp");
    const inspection = configuration.inspect<unknown>("servers");
    const configured = parseServerDefinitions({
        global: inspection?.globalValue,
        workspace: inspection?.workspaceValue,
        workspaceFolder: inspection?.workspaceFolderValue,
    });
    const workspaceMcp = (vscode.workspace.workspaceFolders ?? []).flatMap(readWorkspaceMcpDocument);
    return mergeUnityPreset(mergeDefinitions(configured, workspaceMcp), configuration.get("unityUrl", UNITY_DEFAULT_URL));
}

/** Unity projects always contain both of these sibling directories at the project root. */
export async function findUnityProjects(folders: readonly vscode.WorkspaceFolder[]): Promise<readonly string[]> {
    const found: string[] = [];
    for (const folder of folders) {
        const hasAssets = await directoryExists(vscode.Uri.joinPath(folder.uri, "Assets"));
        const hasSettings = await directoryExists(vscode.Uri.joinPath(folder.uri, "ProjectSettings"));
        if (hasAssets && hasSettings) {
            found.push(folder.uri.fsPath);
        }
    }
    return found;
}

async function directoryExists(uri: vscode.Uri): Promise<boolean> {
    try {
        return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
    } catch {
        return false;
    }
}

function readWorkspaceMcpDocument(folder: vscode.WorkspaceFolder): readonly McpServerDefinition[] {
    const documentPath = path.join(folder.uri.fsPath, ".vscode", "mcp.json");
    if (!existsSync(documentPath)) {
        return [];
    }
    try {
        return parseWorkspaceMcpDocument(JSON.parse(readFileSync(documentPath, "utf8")));
    } catch {
        return [];
    }
}

function mergeDefinitions(...groups: readonly (readonly McpServerDefinition[])[]): readonly McpServerDefinition[] {
    const definitions = new Map<string, McpServerDefinition>();
    for (const group of groups) {
        for (const definition of group) {
            definitions.set(definition.id, definition);
        }
    }
    return [...definitions.values()];
}
