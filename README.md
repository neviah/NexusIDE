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
- OpenCode as the required launch harness.
- FreeCode and Free Claude Code only after they pass the same coding-harness conformance suite.
- JavaScript, TypeScript, HTML, CSS, JSON, Python, and C#/Unity workflows.
- Ollama plus a provider registry designed for multiple free-tier and OpenAI-compatible services.

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
- [Architecture decisions](docs/DECISIONS.md)
- [Upstream maintenance](docs/UPSTREAM.md)

## Development Quick Start

```powershell
git clone --recurse-submodules https://github.com/neviah/NexusIDE.git
Set-Location NexusIDE
./scripts/bootstrap.ps1
./scripts/compile-code-oss.ps1
./scripts/build-nexus-ai.ps1
./scripts/launch-code-oss.ps1 -WithNexusAI
```

The bootstrap downloads the exact Code-OSS Node.js version into `.tools/` when the system Node is incompatible. It does not replace the user's global Node installation.

`@nexus/ai-core` lives in `packages/ai-core`. It provides dependency-free runtime contracts, Ollama and OpenAI-compatible transports, secure error normalization, and free-first routing. `build-nexus-ai.ps1` validates this package before compiling the extension.

## Status

Phases 0 and 2 are complete. Phase 1 branding and packaging validation continues alongside the Phase 3 Ask and Design experience.