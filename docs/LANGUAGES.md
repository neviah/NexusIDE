# Git And Language Workflows

Last verified: 2026-09-01

## Workflow Gate

Run both Phase 7 gates from the repository root:

```powershell
./scripts/test-phase7-workflows.ps1
./scripts/test-nexus-ai.ps1
```

The workflow script creates an isolated bare Git remote and two clones, then verifies status, working and staged diffs, staging, commits, branches, push, clone, and fast-forward pull. It also checks Git Credential Manager discovery, public GitHub HTTPS connectivity, JavaScript and JSON runtime syntax, Python compile/run, and installed .NET and Unity prerequisites.

The Electron gate runs inside Code-OSS. It verifies JavaScript, TypeScript, and CSS completions; HTML symbols and formatting; JSON diagnostics and formatting; the debug surface; the bundled Git extension; and NexusIDE commands.

## Verified Matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Native Git | Isolated two-clone round trip through local remote | Pass |
| GitHub transport | `git ls-remote` over HTTPS; this repository is pushed with system Git | Pass |
| Credentials | System Git reports Git Credential Manager | Pass |
| Agent Git | `git commit` and `git push` use OpenCode `ask` policy and NexusIDE's modal Allow Once flow | Pass |
| Destructive operations | Reset-hard, clean, checkout/restore discard, publish, and recursive deletion remain denied | Pass |
| JavaScript/TypeScript | Built-in completion providers and Node syntax | Pass |
| HTML/CSS/JSON | Built-in completion, symbols, diagnostics, and formatting providers | Pass |
| Debugging | Native Run and Debug command surface | Pass |
| Python runtime | Python 3.14 compile and execution | Pass on verification host |
| C# runtime | .NET runtimes detected, but no SDK | Optional setup required on verification host |
| Unity | No Unity editor detected | Optional setup required on verification host |

Optional rows are capability-gated. They pass on equipped machines and produce setup guidance otherwise; their absence does not make built-in web, Git, or AI workflows fail.

## Tooling Selection

### Python

`ms-python.python` is approved as an optional Open VSX installation. Its source and registry artifact are MIT-licensed. `ms-python.debugpy` is required for debugging. NexusIDE does not silently install Pylance or depend on Microsoft's Marketplace.

### C#

The official `ms-dotnettools.csharp` source is MIT, but its shipped runtime components have additional terms and the extension is not available from Open VSX under that ID. NexusIDE does not bundle C# Dev Kit or fetch Marketplace-only components. Users may install a reviewed compatible VSIX after installing a .NET SDK.

### Unity

Unity project generation starts with the project's `com.unity.ide.vscode` package. Attach/debug additionally needs a compatible C# extension and Unity extension. The official Unity extension is not available from Open VSX under `visualstudiotoolsforunity.vstuc`, so it remains an optional reviewed VSIX rather than a bundled dependency.

Run **NexusIDE: Check Language Tooling** from the Command Palette to detect runtimes and extensions and print exact setup actions in the **NexusIDE Language Tooling** output channel.