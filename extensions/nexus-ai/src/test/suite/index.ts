import assert from "node:assert/strict";
import * as vscode from "vscode";

const REQUIRED_COMMANDS = [
    "workbench.view.explorer",
    "workbench.view.search",
    "workbench.view.scm",
    "workbench.view.debug",
    "workbench.action.openSettings",
] as const;

export async function run(): Promise<void> {
    const commands = new Set(await vscode.commands.getCommands(true));
    for (const command of REQUIRED_COMMANDS) {
        assert.ok(commands.has(command), `Missing native command: ${command}`);
    }

    const document = await vscode.workspace.openTextDocument({ language: "plaintext", content: "NexusIDE" });
    const editor = await vscode.window.showTextDocument(document);
    const edited = await editor.edit((builder) => builder.insert(new vscode.Position(0, 8), " smoke"));
    assert.equal(edited, true);
    assert.equal(document.getText(), "NexusIDE smoke");

    await vscode.commands.executeCommand("workbench.view.explorer");
    await vscode.commands.executeCommand("workbench.view.search");
    await vscode.commands.executeCommand("workbench.view.scm");
    const git = vscode.extensions.getExtension("vscode.git");
    assert.ok(git, "The built-in Git extension is unavailable.");
    await git.activate();

    const terminal = vscode.window.createTerminal({ name: "NexusIDE Surface Smoke" });
    terminal.show();
    terminal.dispose();

    await vscode.commands.executeCommand("workbench.action.openSettings");
    await vscode.commands.executeCommand("workbench.view.debug");
    await vscode.commands.executeCommand("workbench.view.explorer");
    await vscode.commands.executeCommand("workbench.view.extension.nexus-ai");

    console.log("NexusIDE native surface smoke test passed.");
}