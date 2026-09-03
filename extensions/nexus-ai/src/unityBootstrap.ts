import * as vscode from "vscode";

export const UNITY_BOOTSTRAP_DIRECTORIES = ["Assets/Scripts", "Assets/Scenes", "Assets/Prefabs", "Assets/Tests"] as const;
const AGENTS_FILE = "AGENTS.md";
const AGENTS_CONTENT = `# Unity Project Instructions

- Use Unity MCP for scene, asset, and Editor operations.
- Make one small change at a time, then verify it through Unity and inspect Console errors.
- Do not modify UserSettings or AI Game Developer connection settings.
- Put runtime C# scripts in Assets/Scripts and tests in Assets/Tests.
`;

/** Creates only missing starter directories and a non-destructive project instruction file. */
export async function bootstrapUnityProject(root: vscode.Uri): Promise<readonly string[]> {
    const created: string[] = [];
    for (const directory of UNITY_BOOTSTRAP_DIRECTORIES) {
        const uri = vscode.Uri.joinPath(root, ...directory.split("/"));
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            await vscode.workspace.fs.createDirectory(uri);
            created.push(directory);
        }
    }
    const instructions = vscode.Uri.joinPath(root, AGENTS_FILE);
    try {
        await vscode.workspace.fs.stat(instructions);
    } catch {
        await vscode.workspace.fs.writeFile(instructions, Buffer.from(AGENTS_CONTENT, "utf8"));
        created.push(AGENTS_FILE);
    }
    return created;
}
