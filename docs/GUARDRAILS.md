# NexusIDE Engineering Guardrails

These rules keep NexusIDE maintainable, safe, and honest as it evolves.

## 1. Thin Fork

1. Prefer a bundled extension or standalone package over a Code-OSS workbench modification.
2. Every workbench patch requires a decision record stating why public extension APIs are insufficient.
3. Never replace native editor, Explorer, terminal, search, source control, debug, task, or language-client implementations.
4. Keep product branding and build configuration separate from behavioral patches.
5. Rehearse an upstream merge before public beta and at least quarterly afterward.

## 2. Scope

1. NexusIDE is a coding product. Media-generation and game-asset pipelines remain outside the repository.
2. Unity language and debugging support are in scope; Unity asset generation is not.
3. New harnesses enter through the conformance suite, not bespoke UI paths.
4. New providers enter through the provider registry and normalized transport contracts.
5. A custom marketplace, account system, telemetry platform, and remote-development stack require separate approval.

## 3. Harness Qualification

1. Do not call a chat endpoint a coding harness.
2. Agent-mode eligibility requires proven workspace reads, reviewable edits, approved shell execution, streaming, cancellation, changed-file reporting, and structured failures.
3. Discover and display capabilities. Never infer them from a name.
4. Unsupported capabilities are disabled, not emulated through misleading prompts.
5. OpenCode is the reference adapter and only admitted launch harness. Free Code remains unadmitted pending valid licensing and conformance. Free Claude Code is treated as a provider route and must compose with NexusIDE's enforced process policy before integration. Hermes and OpenClaw remain excluded unless evidence passes the full admission process and a new decision record changes scope.

## 4. Agent Safety

1. Ask and Design are technically read-only.
2. Agent writes and commands require a trusted workspace.
3. Resolve all file operations against granted workspace roots and fail closed.
4. Never silently replace dirty editor buffers or newer disk content.
5. Show diffs before applying risky or broad changes.
6. Destructive commands, credential changes, commits, pushes, dependency publishing, and operations outside the workspace require explicit approval. A user may approve ordinary Agent tool calls or mediated file writes for the current NexusIDE session, but this does not bypass commit, push, destructive-operation, protected-path, dirty-buffer, or rollback-conflict safeguards.
7. Cancellation prevents new tool activity and terminates supervised child processes where supported.
8. Audit records describe actions and outcomes without storing secrets or full source content by default.

## 5. Provider Cost And Availability

1. Paid routes are disabled by default.
2. A paid model is never an automatic fallback from a free model.
3. Consent must identify provider, model, and persistence scope.
4. Label routes as local, free-tier, trial-credit, mixed, or paid.
5. Never claim unlimited cloud inference. Local inference is hardware-limited even when it has no per-request fee.
6. Respect provider terms, rate limits, `Retry-After`, and account restrictions. Do not evade quotas through account rotation or other circumvention.
7. Provider catalog facts are time-sensitive and must include a verification date or be discovered from the provider.

## 6. Secrets And Privacy

1. Store API keys and tokens only in VS Code SecretStorage or an OS-backed equivalent.
2. Never place real secrets in settings JSON, logs, fixtures, source control, or migration backups.
3. Webviews never receive provider credentials.
4. Redact authorization headers, query credentials, prompts, source content, and environment values from default logs.
5. Telemetry is off unless a separate consented design names every collected field and retention period.
6. Users can inspect and clear conversations, route history, audit logs, and credentials.

## 7. Dependencies And Licensing

1. Pin the Code-OSS upstream tag or commit and preserve required notices.
2. Do not configure Microsoft's Visual Studio Marketplace without explicit permission.
3. Bundle only extensions and language tools whose licenses permit redistribution.
4. Review new runtime dependencies for maintenance, native-build, license, and supply-chain risk.
5. Lock dependencies and use automated vulnerability and secret scanning.

## 8. Quality Gates

1. Stock Code-OSS must build before branded changes are debugged.
2. Every transport and harness has deterministic contract tests.
3. Tests cover cancellation, malformed streams, 401/403, 429, 5xx, timeouts, fallback exhaustion, and secret redaction.
4. Agent tests cover path traversal, dirty buffers, concurrent external edits, command denial, partial edits, and failed validation.
5. End-to-end smoke tests use local or free-tier models unless paid use is explicitly approved.
6. Windows installer and portable builds are tested on clean Windows 10 and 11 environments.
7. No release skips its phase exit gate without a documented, time-bounded exception.

## 9. User Experience

1. NexusIDE remains usable when every AI provider and harness is offline.
2. Startup never waits for provider discovery or health checks.
3. Every long-running operation supports visible progress and cancellation.
4. Errors identify the failed layer and provide a useful next action.
5. Harness and model choices live in the chat surface, not the Activity Bar.
6. Preserve native Code-OSS keyboard navigation and customizable layout.

## 10. Release Discipline

1. Use alpha, beta, and stable channels with isolated update feeds.
2. Generate installer and portable artifacts from CI.
3. Verify version values from source files before bumping or packaging.
4. Produce checksums and, before public release, signed artifacts and provenance.
5. Maintain rollback instructions and retain the previous known-good release.