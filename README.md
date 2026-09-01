# NexusIDE

NexusIDE is a Windows-first, Code-OSS-based coding environment with Nexus routing, local-model support, and interchangeable coding harnesses built into the right sidebar.

## Product Direction

- Use Code-OSS for the editor, Explorer, search, terminal, source control, language services, debugger, settings, and workspace model.
- Keep the fork thin. Nexus-specific behavior belongs in a bundled extension and reusable packages whenever public extension APIs are sufficient.
- Reuse the provider routing, fallback, streaming, and Ollama cookbook concepts from NexusOS without carrying over its media-generation features or monolithic state store.
- Treat folders and `.code-workspace` files as shared workspaces so NexusIDE and external coding harnesses can work on the same files.
- Prefer no-cost local and provider free-tier routes, disclose quotas and fallbacks, and require explicit approval before selecting a paid route.

## Launch Scope

The first private alpha targets:

- Native file editing, search, terminal, Git, and GitHub-compatible push and pull workflows.
- Ask, Agent, and Design modes in the right sidebar.
- OpenCode as the sole admitted launch harness; Free Claude Code is tracked as a possible provider route, while other candidates require valid licensing and full conformance evidence.
- JavaScript, TypeScript, HTML, CSS, JSON, Python, and C#/Unity workflows.
- Ollama, Groq, verified-free OpenRouter models, and optional custom OpenAI-compatible local/self-hosted endpoints through an extensible provider registry.

Hermes and OpenClaw are not launch targets. NexusOS configures them as chat endpoints, but the current integration does not establish the coding operations NexusIDE requires.

## Coding Harness Definition

A harness is eligible for NexusIDE Agent mode only when automated contract tests prove that it can:

1. Read files within an explicitly granted workspace.
2. Produce reviewable file edits without silently overwriting dirty buffers.
3. Run approved shell commands and report exit status and output.
4. Stream progress and support cancellation.
5. Report changed files, errors, and completion using a normalized result contract.

Harnesses that only provide model chat remain usable in Ask mode but are not presented as coding agents.

## Documents

- [System design](docs/DESIGN.md)
- [Delivery phases](docs/PHASES.md)
- [Current phase status](docs/STATUS.md)
- [Engineering guardrails](docs/GUARDRAILS.md)
- [Provider strategy](docs/PROVIDERS.md)
- [Harness evaluation](docs/HARNESSES.md)
- [Git and language workflows](docs/LANGUAGES.md)
- [Private alpha setup](docs/SETUP.md)
- [Packaging and release](docs/PACKAGING.md)
- [Privacy](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Upstream maintenance](docs/UPSTREAM.md)

## Development Quick Start

```powershell
git clone --recurse-submodules https://github.com/neviah/NexusIDE.git
Set-Location NexusIDE
./scripts/bootstrap.ps1
./scripts/compile-code-oss.ps1
./scripts/build-nexus-ai.ps1
./scripts/test-nexus-ai.ps1
./scripts/test-phase7-workflows.ps1
./scripts/launch-code-oss.ps1 -WithNexusAI
./scripts/build-portable.ps1
./scripts/test-phase8-artifacts.ps1
./scripts/install-pinokio-launcher.ps1
```

The bootstrap downloads the exact Code-OSS Node.js version into `.tools/` when the system Node is incompatible. It does not replace the user's global Node installation.

Run **NexusIDE: Check Language Tooling** from the Command Palette for Python, C#, and Unity runtime and extension readiness. Missing optional components are reported with setup steps instead of silently disabling features.

`@nexus/ai-core` lives in `packages/ai-core`. It provides dependency-free runtime contracts, Ollama and OpenAI-compatible transports, secure error normalization, and free-first routing. `build-nexus-ai.ps1` validates this package before compiling the extension.

## Agent Mode

Install the launch harness once, then start NexusIDE normally:

```powershell
npm install -g opencode-ai
./scripts/launch-code-oss.ps1 -WithNexusAI
```

Agent mode starts `opencode acp` as a supervised process. It requires a trusted workspace, selects only an advertised Ollama, Groq, or explicit OpenRouter `:free` model, asks before edits and commands, denies outside-workspace and publishing operations, opens native diffs, protects dirty buffers and newer file versions, and records changed files plus validation results. Set `nexusAI.openCodePath` only when OpenCode is not available from the normal global npm location or `PATH`.

## Status

Phases 0 through 8 are complete. Phase 9 prepares signed, hardened public beta releases.