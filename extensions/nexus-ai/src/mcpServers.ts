import * as vscode from "vscode";
import { McpServerDefinition } from "@nexus/ai-core";
import { mergeUnityPreset, parseServerDefinitions, UNITY_DEFAULT_URL } from "./mcpServerDefinitions";

export * from "./mcpServerDefinitions";

export function readServerDefinitions(): readonly McpServerDefinition[] {
    const configuration = vscode.workspace.getConfiguration("nexusAI.mcp");
    const inspection = configuration.inspect<unknown>("servers");
    const configured = parseServerDefinitions({
        global: inspection?.globalValue,
        workspace: inspection?.workspaceValue,
        workspaceFolder: inspection?.workspaceFolderValue,
    });
    return mergeUnityPreset(configured, configuration.get("unityUrl", UNITY_DEFAULT_URL));
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
