import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { assessLanguageTooling, LanguageToolingInventory } from "./languageToolingAssessment";

export async function showLanguageToolingReport(channel: vscode.OutputChannel): Promise<void> {
    const inventory: LanguageToolingInventory = {
        pythonRuntime: await commandSucceeds("python", ["--version"]),
        pythonExtension: extensionInstalled("ms-python.python"),
        pythonDebugger: extensionInstalled("ms-python.debugpy"),
        dotnetSdk: await hasDotnetSdk(),
        csharpExtension: extensionInstalled("ms-dotnettools.csharp"),
        unityEditor: detectUnityEditor(),
        unityExtension: extensionInstalled("visualstudiotoolsforunity.vstuc"),
    };
    const assessment = assessLanguageTooling(inventory);
    channel.clear();
    channel.appendLine("NexusIDE language tooling readiness");
    channel.appendLine("");
    for (const item of assessment) {
        channel.appendLine(`[${item.ready ? "ready" : "setup"}] ${item.language}: ${item.detail}`);
        if (item.action) channel.appendLine(`  ${item.action}`);
    }
    channel.show(true);
    const missing = assessment.filter((item) => !item.ready).map((item) => item.language);
    if (missing.length === 0) {
        await vscode.window.showInformationMessage("Python, C#, and Unity tooling are ready.");
    } else {
        await vscode.window.showWarningMessage(`Optional tooling needs setup: ${missing.join(", ")}. See the NexusIDE Language Tooling output.`);
    }
}

function extensionInstalled(id: string): boolean {
    return vscode.extensions.getExtension(id) !== undefined;
}

async function hasDotnetSdk(): Promise<boolean> {
    const output = await commandOutput("dotnet", ["--list-sdks"]);
    return output.trim().length > 0;
}

function detectUnityEditor(): boolean {
    const configured = process.env.UNITY_EDITOR_PATH;
    if (configured && existsSync(configured)) return true;
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter((value): value is string => Boolean(value));
    return roots.some((root) => existsSync(path.join(root, "Unity", "Hub", "Editor")));
}

async function commandSucceeds(command: string, args: readonly string[]): Promise<boolean> {
    return (await commandOutput(command, args)) !== "";
}

function commandOutput(command: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve) => execFile(command, args, { windowsHide: true, timeout: 5_000 }, (error, stdout, stderr) => {
        resolve(error ? "" : `${stdout}${stderr}`);
    }));
}