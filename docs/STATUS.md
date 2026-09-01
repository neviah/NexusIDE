# NexusIDE Status

Last updated: 2026-09-01

## Current Milestone

Phase 5: expand free-first routing and provider configuration after completing the OpenCode reference harness.

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
- NexusIDE brand assets are generated deterministically for the Windows executable, tiles, and bundled Nexus AI view.
- Native-surface integration tests exercise editing, Explorer, search, terminal, Git/SCM, settings, debugger, and Nexus AI in Code-OSS.
- The unsigned Windows x64 artifact bundles Nexus AI, preserves a portable `data` directory in its ZIP, and runs with the `NexusIDE` product identity.
- Ask and Design discover configured Ollama and Groq models and stream through the free-first router with visible route and fallback metadata.
- Agent mode runs OpenCode `1.16.2` through the official ACP SDK with streamed text, tools, command output, edits, completion, cancellation, and failures.
- Completed Ask and Design turns persist in bounded workspace state and restore after the webview reloads; malformed state is discarded.
- OpenRouter discovers its live catalog and admits only models whose prompt, completion, and request prices are explicitly zero.
- The Nexus Router Activity Bar view manages Groq and OpenRouter credentials, discovers available models, and persists an ordered Auto route stack.
- Ask and Design can attach bounded active-file, selection, symbol, diagnostic, terminal-selection, and Git-diff context.
- Regenerate, Stop, New Conversation, and a bounded conversation list work without retaining stale attachments across runs.
- The Electron integration gate opens both Nexus AI and Nexus Router and fails on extension-host assertion logs.
- The normalized `CodingHarness` contract and reusable deterministic ACP conformance fixture cover permission, read, two-file edit, shell output, failed-validation recovery, change reporting, secret redaction, and cancellation.
- Agent safety requires Workspace Trust, canonical root containment, dirty-buffer and newer-disk checks, one-time native approvals, immutable diff previews, and fail-closed external path handling.
- OpenCode receives Nexus-held Groq and OpenRouter credentials only through its supervised process environment; emitted values are redacted before reaching the webview or audit.
- Agent model selection occurs through ACP before prompting and permits Ollama, Groq free-tier, or explicit OpenRouter `:free` choices; paid defaults fail closed.
- OpenCode ACP v1 initialization, session creation, and explicit free-model selection pass model-free runtime smoke tests on Windows.

## Next

- Begin Phase 5 provider discovery, health, quota metadata, and Router UI expansion.

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
- [x] Explorer, editor, search, terminal, source control, settings, and debugger remain functional.
- [x] Nexus AI mock streaming view runs in the Secondary Side Bar.
- [x] Workbench source modifications are listed in the decision log (none required).
- [x] Branded unsigned Windows x64 portable artifact builds and launches with Nexus AI bundled.

## Phase 2 Exit Gate

- [x] Unit tests prove bounded retries, fallback order, cancellation, redaction, and error normalization.
- [x] Ollama and Groq stream through the same core provider API.
- [x] Provider credentials use VS Code SecretStorage and are never persisted in repository files or ordinary extension state.

## Phase 3 Exit Gate

- [x] Ask and Design work with Ollama, Groq free-tier models, and currently verified free OpenRouter models.
- [x] Ask and Design remain read-only while Agent tools remain disabled until Phase 4 safety contracts are active.
- [x] Route attempts and fallback metadata are visible in the transcript.
- [x] Bounded conversations restore after reload without exposing provider credentials.
- [x] File, selection, symbol, diagnostic, terminal-selection, and Git-diff attachments are bounded before routing.
- [x] Stop, Regenerate, New Conversation, and conversation switching are implemented and tested.

## Phase 4 Exit Gate

- [x] OpenCode passes deterministic read, edit, shell, stream, cancel, and change-reporting tests.
- [x] The conformance agent performs a two-file change, opens both diffs, reports an approved failed validation, and recovers with a passing validation.
- [x] Cancellation terminates supervised work, prevents subsequent tool activity, and persists a coherent audit summary.
- [x] Relative, traversal, sibling-prefix, device, alternate-stream, symlink, junction, and outside-workspace paths fail closed.