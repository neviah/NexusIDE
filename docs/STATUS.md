# NexusIDE Status

Last updated: 2026-09-01

## Current Milestone

Phase 3: Ask and Design experience, with remaining Phase 1 packaging work tracked separately.

## Completed

- NexusIDE repository created and published at `neviah/NexusIDE`.
- Architecture, delivery phases, provider policy, guardrails, and decisions documented.
- Code-OSS `1.136.0` selected from `release/1.136`.
- Upstream commit pinned as submodule: `6b83849594a181ba0dcadea99844b6f1f42bbcc9`.
- Required Node.js version verified from upstream: `24.18.0`.
- Visual Studio Build Tools 2022, Visual C++ x64 tools, Windows 11 SDK, Python, and Git detected locally.
- Portable Node `24.18.0` downloaded and prerequisite checks added.
- Code-OSS dependencies installed successfully.
- Stock Code-OSS compiled with zero errors.
- Stock Code-OSS launched successfully with isolated user data; main, renderer, Agent Host, and Extension Host initialized.
- Nexus AI extension shell compiles against the pinned Code-OSS API and loads in the development Extension Host.
- Ask, Agent, Design, harness, model, Stop, and mock-streaming UI contracts are implemented.
- `@nexus/ai-core` provides framework-independent provider, model, route, stream, error, retry, fallback, cancellation, and redaction contracts.
- Ollama and Groq stream through the normalized provider API using injected, deterministic contract fixtures.
- The extension registers Ollama and Groq while keeping Groq credentials exclusively in VS Code SecretStorage.
- Core contract tests cover bounded retries, deterministic fallback, paid-route blocking, cancellation, malformed streams, 401/403, 408, 429, 5xx, fallback exhaustion, and secret redaction.

## In Progress

- Create development brand assets and a portable artifact path.
- Verify native IDE surfaces under the NexusIDE product identity.
- Replace the prototype response with routed Ask and Design streams.

## Next

- Package the Nexus AI extension as a bundled extension.
- Add conversation persistence and workspace context attachments.

## Phase 0 Exit Gate

- [x] Remote repository configured.
- [x] Stable upstream version and commit pinned.
- [x] Tool requirements derived from upstream files.
- [x] Reproducible bootstrap scripts created.
- [x] Clean dependency installation succeeds.
- [x] Stock Code-OSS compilation succeeds.
- [x] Stock Code-OSS launches on Windows.

## Phase 1 Exit Gate

- [x] NexusIDE and VS Code use isolated product data.
- [ ] Explorer, editor, search, terminal, source control, settings, and debugger remain functional.
- [x] Nexus AI mock streaming view runs in the Secondary Side Bar.
- [x] Workbench source modifications are listed in the decision log (none required).

## Phase 2 Exit Gate

- [x] Unit tests prove bounded retries, fallback order, cancellation, redaction, and error normalization.
- [x] Ollama and Groq stream through the same core provider API.
- [x] Provider credentials use VS Code SecretStorage and are never persisted in repository files or ordinary extension state.