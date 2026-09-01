import assert from "node:assert/strict";
import * as vscode from "vscode";

const REQUIRED_COMMANDS = [
    "workbench.view.explorer",
    "workbench.view.search",
    "workbench.view.scm",
    "workbench.view.debug",
    "workbench.action.openSettings",
    "workbench.view.extension.nexus-router",
    "workbench.view.extension.nexus-cookbook",
    "nexusAI.setOpenRouterApiKey",
    "nexusAI.checkLanguageTooling",
] as const;

export async function run(): Promise<void> {
    const nexus = vscode.extensions.getExtension("nexuside.nexus-ai");
    assert.ok(nexus, "The Nexus AI extension is unavailable.");
    await nexus.activate();

    const commands = new Set(await vscode.commands.getCommands(true));
    for (const command of REQUIRED_COMMANDS) {
        assert.ok(commands.has(command), `Missing native command: ${command}`);
    }

    const document = await vscode.workspace.openTextDocument({ language: "plaintext", content: "NexusIDE" });
    const editor = await vscode.window.showTextDocument(document);
    const edited = await editor.edit((builder) => builder.insert(new vscode.Position(0, 8), " smoke"));
    assert.equal(edited, true);
    assert.equal(document.getText(), "NexusIDE smoke");

    await verifyWebLanguageServices();

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
    await vscode.commands.executeCommand("workbench.view.extension.nexus-router");
    await vscode.commands.executeCommand("workbench.view.extension.nexus-cookbook");

    console.log("NexusIDE native surface smoke test passed.");
}

async function verifyWebLanguageServices(): Promise<void> {
    const cases = [
        { language: "javascript", content: "const value = Math.\n", position: new vscode.Position(0, 19) },
        { language: "typescript", content: "const value: string = ''.\n", position: new vscode.Position(0, 25) },
        { language: "css", content: "body {\n  col\n}\n", position: new vscode.Position(1, 5) },
    ] as const;
    for (const item of cases) {
        const document = await vscode.workspace.openTextDocument({ language: item.language, content: item.content });
        await vscode.window.showTextDocument(document);
        assert.equal(document.languageId, item.language);
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", document.uri, item.position);
        assert.ok(completions.items.length > 0, `No ${item.language} completions were provided.`);
    }

    const html = await vscode.workspace.openTextDocument({ language: "html", content: "<main><h1>NexusIDE</h1></main>" });
    await vscode.window.showTextDocument(html);
    const htmlSymbols = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", html.uri);
    assert.ok(htmlSymbols.length > 0, "HTML document symbols were not produced.");
    const htmlFormatted = await vscode.commands.executeCommand<vscode.TextEdit[]>("vscode.executeFormatDocumentProvider", html.uri, { tabSize: 2, insertSpaces: true });
    assert.ok(Array.isArray(htmlFormatted), "HTML formatting provider is unavailable.");

    const json = await vscode.workspace.openTextDocument({ language: "json", content: "{ \"broken\": }" });
    await vscode.window.showTextDocument(json);
    const deadline = Date.now() + 5_000;
    while (vscode.languages.getDiagnostics(json.uri).length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(vscode.languages.getDiagnostics(json.uri).length > 0, "JSON diagnostics were not produced.");
    const validJson = await vscode.workspace.openTextDocument({ language: "json", content: "{\"enabled\":true}" });
    await vscode.window.showTextDocument(validJson);
    const formatted = await vscode.commands.executeCommand<vscode.TextEdit[]>("vscode.executeFormatDocumentProvider", validJson.uri, { tabSize: 2, insertSpaces: true });
    assert.ok(formatted.length > 0, "JSON formatting provider is unavailable.");
}