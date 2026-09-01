export interface LanguageToolingInventory {
    pythonRuntime: boolean;
    pythonExtension: boolean;
    pythonDebugger: boolean;
    dotnetSdk: boolean;
    csharpExtension: boolean;
    unityEditor: boolean;
    unityExtension: boolean;
}

export interface LanguageToolingAssessment {
    language: "Python" | "C#" | "Unity";
    ready: boolean;
    detail: string;
    action?: string;
}

export function assessLanguageTooling(inventory: LanguageToolingInventory): LanguageToolingAssessment[] {
    return [
        inventory.pythonRuntime && inventory.pythonExtension && inventory.pythonDebugger
            ? { language: "Python", ready: true, detail: "Interpreter, language extension, and debugger detected." }
            : {
                language: "Python",
                ready: false,
                detail: "Python needs an interpreter plus language and debug extensions.",
                action: "Install Python, then install ms-python.python and ms-python.debugpy from Open VSX or reviewed VSIX files.",
            },
        inventory.dotnetSdk && inventory.csharpExtension
            ? { language: "C#", ready: true, detail: ".NET SDK and C# extension detected." }
            : {
                language: "C#",
                ready: false,
                detail: "C# needs a .NET SDK and a compatible language extension.",
                action: "Install the .NET SDK and a reviewed C# extension. NexusIDE does not bundle C# Dev Kit or Marketplace-only runtime components.",
            },
        inventory.unityEditor && inventory.csharpExtension && inventory.unityExtension
            ? { language: "Unity", ready: true, detail: "Unity editor, C# extension, and Unity extension detected." }
            : {
                language: "Unity",
                ready: false,
                detail: "Unity attach/debug needs Unity plus compatible C# and Unity extensions.",
                action: "Install Unity Hub and an editor, add com.unity.ide.vscode to the project, then install reviewed C# and Unity VSIX extensions.",
            },
    ];
}