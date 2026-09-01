# NexusIDE Status

Last updated: 2026-09-01

## Current Milestone

Phase 9: harden the private alpha for public beta readiness.

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
- Free-first routing persists rate-limit cooldowns and provider quota observations, excludes exhausted or cooling routes, and falls back without retrying a throttled route on the next request.
- Provider discovery uses health checks, model capabilities, cost class, user priority, quota state, and cooldown state while paid, trial, and unverified mixed routes remain ineligible by default.
- The Nexus Router view exposes provider enablement, health and latency, checked time, quota/reset state, cooldowns, user quota notes, credential refresh, and explicit Auto stack ordering.
- A disabled-by-default custom OpenAI-compatible provider supports loopback, self-hosted, and local gateway URLs with an optional SecretStorage API key.
- Tier 2 provider candidates remain deferred until each provider-specific authentication, catalog, quota, desktop-use terms, and mocked contract satisfy the admission checklist.
- Phase 6 admitted no additional coding harness after evaluating `freecodexyz/free-code` and `Alishahryar1/free-claude-code`: Free Code lacks a license grant and conformance evidence, while Free Claude Code is a provider proxy whose OpenCode launcher cannot yet compose with NexusIDE's enforced process policy.
- Agent mode now derives the displayed identity from the admitted OpenCode manifest and rejects mismatched or incomplete harness identities at the host boundary.
- Core harness qualification distinguishes Agent-capable, Ask-only, and ineligible manifests; OpenCode remains the only adapter with complete deterministic lifecycle and model-free runtime evidence.
- Native Git status, diff, stage, commit, branch, push, clone, pull, credential-helper discovery, and GitHub HTTPS transport pass the repeatable Phase 7 workflow matrix.
- Agent `git commit` and `git push` now reach the modal Allow Once approval flow; destructive Git, package publishing, and recursive deletion remain hard-denied.
- Electron integration verifies built-in JavaScript, TypeScript, HTML, CSS, and JSON language services plus the native debug surface.
- Python 3.14 compile/run passes locally; the optional tooling checker reports interpreter, extension, and debugger readiness with actionable setup instructions.
- C# and Unity remain optional: the checker detects missing .NET SDK, Unity editor, and reviewed extensions instead of claiming unavailable functionality.
- Python's MIT Open VSX extension path is approved; official C# and Unity extensions are not bundled because the required artifacts are absent from Open VSX and shipped runtime terms require separate review.
- Windows packaging emits a versioned per-user Inno installer, portable ZIP, release manifest, and SHA-256 checksum list from the same branded build.
- Artifact checks verify hashes, portable layout, bundled Nexus AI, and the expected unsigned status; the install smoke test covers non-admin install, launch, and uninstall under spaces and non-ASCII paths.
- The Pinokio app launcher resolves the configured Pinokio home and provides checksum-verified Install, Launch, Update, Repair, and Reset actions.
- Windows CI runs package, Git/language, launcher, dependency-review, and secret-scan gates; tagged alpha builds package on a clean runner and publish prerelease assets.
- Private-alpha setup, packaging, provider, harness, language, privacy, troubleshooting, unsigned-warning, and known-limitation documentation is available from the repository index.

## Next

- Begin Phase 9 signing, provenance, migration, recovery, accessibility, scale, offline, upstream-merge, and rollback work.

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

## Phase 5 Exit Gate

- [x] A throttled free route persists cooldown state, falls back transparently, and is skipped on the next request.
- [x] Default routing admits local and verified free-tier routes only; paid, trial, and unverified mixed routes require exact consent.
- [x] Provider transport, quota, cooldown, state, and fallback tests use deterministic mocks and require no paid API calls.
- [x] Router UI describes provider quota as observed, limited, user-entered, or Unknown and never claims unlimited cloud access.

## Phase 6 Exit Gate

- [x] Every named candidate was evaluated through the staged admission process using its authoritative repository, machine interface, setup, license, and security behavior.
- [x] Agent mode exposes only OpenCode, whose deterministic conformance and model-free Windows smoke evidence remain green.
- [x] Incomplete manifests are explicitly classified Ask-only or ineligible and cannot enter Agent mode.
- [x] Hermes and OpenClaw remain outside launch scope with no unsupported coding claims.

## Phase 7 Exit Gate

- [x] Native Git and GitHub-compatible workflows pass without a Nexus-specific Git implementation.
- [x] Agent commit and push require explicit approval while destructive Git operations remain denied.
- [x] Built-in web language services and debugging pass inside the Electron integration host.
- [x] Python runtime workflows pass and optional Python extension/debug prerequisites are detected.
- [x] C# and Unity workflows are capability-gated and provide actionable setup guidance when the SDK, editor, or reviewed extensions are unavailable.
- [x] Tooling selection and redistribution constraints are recorded in [LANGUAGES.md](LANGUAGES.md).

## Phase 8 Exit Gate

- [x] Versioned Windows x64 installer and portable artifacts are reproducible and checksum-described.
- [x] Clean Windows CI exercises build, tests, packaging, dependency review, secret scanning, non-admin installation, launch, and uninstall.
- [x] Pinokio provides one-click install, launch, update, repair, and reset flows using checksum-verified release artifacts.
- [x] A no-cost Ollama, Groq, or verified-free OpenRouter route can satisfy the documented alpha smoke path; no paid provider is required.
- [x] Setup, privacy, packaging, troubleshooting, known limitations, and unsigned-build warnings are documented.