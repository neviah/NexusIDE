# NexusIDE Delivery Phases

Estimates assume one experienced developer working primarily on NexusIDE. Calendar time grows when the work is intermittent. Each phase has an exit gate; later phases do not hide failures in earlier foundations.

## Phase 0: Repository And Upstream Spike

**Estimate:** 3-5 days

### Work

- Initialize the NexusIDE repository and configure its remote.
- Select a current stable Code-OSS tag after checking its required Node.js, Python, compiler, Windows SDK, and package-manager versions.
- Record `origin` for NexusIDE and `upstream` for Microsoft VS Code.
- Build and launch the unmodified Windows desktop product.
- Capture reproducible bootstrap and build commands.
- Establish a branch and upstream-sync policy.

### Exit Gate

- A clean checkout builds and launches stock Code-OSS on the target Windows machine.
- Required tool versions are documented and checked by a script.
- No Nexus customization has been added to compensate for an unresolved stock build problem.

## Phase 1: Thin NexusIDE Distribution

**Estimate:** 1-2 weeks

### Work

- Apply NexusIDE name, icons, application IDs, protocol, data directories, and quality/channel configuration.
- Configure a NexusIDE-specific extensions directory and profile location.
- Establish the default VS Code-like layout with Explorer left and Secondary Side Bar right.
- Add a bundled extension shell that owns the Nexus AI view.
- Produce a development launch command and unsigned portable artifact.

### Exit Gate

- NexusIDE and VS Code can run side by side without sharing or corrupting user data.
- Explorer, editor, search, terminal, source control, settings, and debugger surfaces open normally.
- A mock streaming conversation appears in the right sidebar.
- All workbench source modifications are listed in the decision log.

## Phase 2: AI Core Extraction

**Estimate:** 2 weeks

### Work

- Extract provider transport, fallback, retry, streaming, and Ollama concepts from NexusOS.
- Create `@nexus/ai-core` with no Code-OSS, React, Express, media, or global NexusOS state dependency.
- Define structured provider, model, route, stream, cancellation, and error contracts.
- Implement SecretStorage-backed credential access in the extension layer.
- Add contract fixtures for OpenAI-compatible SSE, malformed responses, throttling, and cancellation.

### Exit Gate

- Unit tests prove bounded retries, fallback order, cancellation, redaction, and error normalization.
- Ollama and one cloud free-tier provider stream through the same core API.
- No raw provider key is stored in repository files or ordinary extension state.

## Phase 3: Ask And Design Experience

**Estimate:** 1-2 weeks

### Work

- Build conversation list, transcript, composer, attachments, Stop, and Regenerate.
- Add independent mode, harness, provider, and model controls.
- Implement file, selection, symbol, diagnostic, terminal-output, and Git-diff context attachments.
- Enforce read-only behavior in Ask and Design modes.
- Persist and restore workspace conversations with bounded history.

### Exit Gate

- Ask and Design work with local and cloud free-tier routes.
- Switching mode changes enforced capabilities.
- Route and fallback metadata are visible.
- Reloading the window restores conversations without exposing secrets.

## Phase 4: OpenCode Agent Integration

**Estimate:** 2-3 weeks

### Work

- Implement the normalized coding-harness protocol for OpenCode.
- Stream progress, tool requests, command output, edits, completion, and failures.
- Add Workspace Trust checks, path containment, command approvals, diff preview, dirty-buffer conflict handling, and cancellation.
- Report changed files and validation results in the final run summary.
- Create a harness conformance suite reusable by future adapters.

### Exit Gate

- OpenCode passes read, edit, shell, stream, cancel, and change-reporting tests.
- An agent can make a small multi-file change, show the diff, run an approved test, and recover from a failed validation.
- Cancellation stops new tool activity and leaves a coherent audit record.
- Writes outside the granted workspace fail closed.

## Phase 5: Free-First Router And Provider Expansion

**Estimate:** 1-2 weeks

### Work

- Implement provider discovery, health checks, capability filtering, scoring, cooldowns, and quota metadata.
- Add Ollama, custom OpenAI-compatible, OpenRouter, and Groq adapters first.
- Evaluate additional providers from [PROVIDERS.md](PROVIDERS.md) against current terms and APIs.
- Add the explicit paid-route consent gate.
- Build settings for credentials, priorities, health, and per-provider disablement.

### Exit Gate

- Exhausting or throttling one free tier falls back transparently to another eligible free route.
- No paid request is possible under default settings.
- Provider tests use mocks by default and free-tier accounts only for controlled smoke tests.
- The UI never describes cloud access as unlimited.

## Phase 6: Candidate Harnesses

**Status:** Complete

**Estimate:** 1-2 weeks per materially different harness

### Work

- Run FreeCode and Free Claude Code through the conformance suite.
- Add adapters only where their process and event contracts differ from OpenCode.
- Compare capability, setup burden, reliability, model-routing control, and maintenance cost.
- Remove redundant choices when two labels expose effectively the same runtime.

### Exit Gate

- A candidate appears in Agent mode only after passing every required conformance test.
- Ask-only integrations are labeled as such.
- Hermes and OpenClaw remain out of launch scope unless new evidence supports an explicit decision change.

## Phase 7: Git And Language Workflows

**Status:** Complete

**Estimate:** 2-3 weeks

### Work

- Verify native Git status, diff, stage, commit, branch, pull, push, and credential-helper behavior.
- Add agent-facing Git context and approval-gated commit/push commands through public APIs or the terminal.
- Verify JS/TS, HTML, CSS, and JSON completion, diagnostics, formatting, and debugging.
- Select and curate redistributable Python and C#/Unity tooling.
- Test Python interpreters and debugging, C# project discovery, Unity solution generation, and Unity attach/debug flows.

### Exit Gate

- Representative web, Python, and C#/Unity projects pass the workflow matrix.
- GitHub repositories can be cloned and pushed without requiring a Nexus-specific Git implementation.
- Missing optional language tooling produces actionable setup guidance.

## Phase 8: Packaging And Private Alpha

**Status:** Complete

**Estimate:** 2 weeks

### Work

- Produce Windows installer and portable artifacts.
- Add Pinokio install, launch, update, and repair flows.
- Test clean Windows 10/11 virtual machines, non-admin installation, spaces, and non-ASCII paths.
- Add CI for build, tests, packaging, dependency review, and secret scanning.
- Write setup, provider, harness, privacy, and troubleshooting documentation.

### Exit Gate

- A non-developer can install, configure one free route, open a repository, complete an agent change, and uninstall NexusIDE.
- No paid provider is required for the smoke test.
- Known limitations and unsigned-build warnings are documented.

## Phase 9: Public Beta Readiness

**Status:** Engineering complete; trusted production certificate provisioning required before public beta publication

**Estimate:** 3-6 additional weeks

### Work

- Add code signing and release provenance.
- Harden migrations, crash recovery, logs, and support diagnostics.
- Run accessibility, keyboard, large-workspace, offline, and degraded-provider testing.
- Rehearse an upstream Code-OSS merge.
- Define release channels and update rollback.

### Exit Gate

- [ ] Signed artifacts install without unexpected security warnings (pipeline complete; production certificate not yet provisioned).
- [x] Upstream merge cost is understood and documented.
- [x] Security review finds no critical unresolved issues.
- [x] Release and rollback are reproducible from CI.

## Schedule Summary

| Outcome | Expected elapsed effort |
| --- | --- |
| Branded proof of concept | 2-4 weeks |
| Useful private alpha | 8-12 weeks |
| Distributable beta | 4-6 months |

Do not compress the schedule by implementing native IDE features already owned by Code-OSS. Scope reductions should remove optional providers, candidate harnesses, or polished integrations before weakening security, conformance, or release gates.