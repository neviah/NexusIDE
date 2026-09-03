# NexusIDE System Design

## 1. Purpose

NexusIDE is a standalone Windows coding environment that preserves the familiar Code-OSS workbench while adding a provider-independent AI coding surface. Its differentiator is not a new text editor. It is the ability to use local models, free-tier cloud capacity, and multiple coding harnesses against one shared workspace with consistent safety and review behavior.

## 2. Goals

- Preserve the normal Code-OSS experience for files, editors, terminals, search, Git, debugging, and settings.
- Put AI chat in the Secondary Side Bar on the right by default.
- Offer Ask, Agent, and Design modes with clear and enforceable permissions.
- Allow users to select a coding harness independently from the LLM provider and model.
- Route free-first across local and cloud providers while making cost, quota, fallback, and failure visible.
- Let external harnesses and NexusIDE operate on the same ordinary folder without a proprietary workspace format.
- Keep upstream Code-OSS updates practical by minimizing workbench modifications.

## 3. Non-Goals For The First Release

- Media, voice, image, video, 3D, Blender, or game-asset generation from NexusOS.
- A custom editor, terminal, Git implementation, debugger, LSP client, or extension marketplace.
- Full compatibility with Microsoft's Visual Studio Marketplace.
- Silent autonomous execution outside the opened workspace.
- Guaranteed unlimited cloud inference.
- Remote development, Settings Sync, Live Share, notebooks, and arbitrary extension compatibility guarantees.

## 4. Architecture

```mermaid
flowchart LR
    User[User] --> Workbench[Code-OSS Workbench]
    Workbench --> Native[Native editor, terminal, Git, debug, language services]
    Workbench --> Extension[Nexus AI bundled extension]
    Extension --> Modes[Mode and approval controller]
    Extension --> Context[Workspace context service]
    Extension --> Core[@nexus/ai-core]
    Core --> Harnesses[Coding harness adapters]
    Core --> Router[Free-first model router]
    Router --> Local[Ollama and local OpenAI-compatible APIs]
    Router --> Cloud[Cloud provider adapters]
    Harnesses --> Workspace[Shared workspace folder]
    Modes --> Native
    Context --> Workspace
```

### 4.1 Code-OSS Distribution

Code-OSS remains the owner of native IDE behavior. NexusIDE changes product identity, icons, application identifiers, storage directories, default layout, bundled extensions, and release configuration. Workbench source changes require an architecture decision record and must be impossible or materially worse through a public extension API.

NexusIDE user data and extensions must use directories distinct from both VS Code and stock Code-OSS. This prevents profile corruption and makes uninstall behavior predictable.

### 4.2 Nexus AI Extension

The bundled extension owns:

- Right-sidebar registration and UI.
- Conversation and mode state.
- Context selection and prompt assembly.
- Workspace Trust and approval interactions.
- Diff previews and application of edits through VS Code APIs.
- Terminal and task execution through VS Code APIs.
- SecretStorage integration.
- Diagnostics, audit events, and user-visible route metadata.

The extension may host its webview UI with React, but security and workspace operations remain in the extension host. The webview receives only sanitized view models and communicates through typed messages.

### 4.3 AI Core Package

`@nexus/ai-core` is independent of Code-OSS and UI frameworks. It contains:

- Provider and model registry types.
- Model discovery and capability normalization.
- Streaming completion contracts.
- Retry, fallback, quota, health, and cost policy.
- Harness capability contracts and adapters.
- Ollama and generic OpenAI-compatible transports.
- Model Context Protocol client, transports, and server-trust primitives.
- Cancellation and structured error types.
- Contract-test fixtures.

The package may reuse ideas and focused code from NexusOS, but it must not depend on NexusOS's Express server, global `SystemState`, media runtimes, or plaintext secret persistence.

### 4.4 Optional Local Service

The first implementation should run routing in the extension host unless a concrete constraint requires a separate process. A local service is justified only for process isolation, shared access by multiple clients, long-running harness supervision, or native dependencies. Avoiding an unnecessary daemon reduces startup and packaging complexity.

## 5. User Interface

### 5.1 Default Workbench Layout

- Activity Bar: left edge, native Code-OSS activities.
- Primary Side Bar: Explorer by default, collapsible.
- Editor Area: center, native tabs and editor groups.
- Secondary Side Bar: Nexus AI chat, right side.
- Panel: terminal, problems, output, and debug console at the bottom.
- Harnesses are selected inside Nexus AI and do not occupy Activity Bar entries.

The layout is a default, not a locked arrangement. Users retain native resize, move, hide, and keyboard behavior.

Nexus-owned sidebars use a compact operational-dashboard treatment within native workbench panes. The Router container places the ordered Auto Stack above provider configuration so route health, observed request usage, provider identity, and fallback order remain visible without adding another Activity Bar destination. The same container hosts MCP Servers, where each server states what it runs or contacts and cannot connect before the user grants trust.

### 5.2 Chat Composer

The composer includes:

- Segmented mode control: Ask, Agent, Design, Loop.
- Conversation history selector plus new-conversation and regenerate commands.
- Context attachments: files, selections, symbols, diagnostics, terminal output, and Git changes.
- Send/Stop command.

The chat pane uses the configured Auto Stack rather than duplicating provider and model controls. OpenCode remains the admitted coding harness. Loop runs bounded builder and independent critic rounds against a user-visible quality bar.

The pane is constrained to the Secondary Side Bar viewport. Conversation content scrolls inside the transcript and follows new turns, response deltas, and operational activity. Provider discovery and agent activity are factual, collapsible progress records rather than hidden model reasoning.

### 5.3 Mode Contracts

| Mode | Read workspace | Modify files | Run commands | Primary output |
| --- | --- | --- | --- | --- |
| Ask | With user context | No | No | Explanation or recommendation |
| Design | With user context | No | No by default | Reviewable implementation plan |
| Agent | Within trusted workspace | With approval policy | With approval policy | Applied and validated change |
| Loop | Within trusted workspace | With approval policy | With approval policy | Bounded builder/critic refinement |

Switching modes changes enforced capabilities, not merely the system prompt.

### 5.4 External Tools

Agent and Loop may use tools from Model Context Protocol servers. A server is inert until explicitly trusted, trust is bound to a fingerprint of everything the server can execute or reach, and workspace-supplied definitions are always labelled as such. MCP tools never widen the file, path, or command policy that Agent mode already enforces. See [MCP.md](MCP.md).

Agent profiles are workspace-scoped: `coding` is the general default, `unity` requires small Unity MCP changes followed by Console/test evidence, and `review` denies edits. Regardless of profile, repository files, web content, MCP responses, and tool output are untrusted data rather than instructions that can override the task or system policy.

## 6. Coding Harness Contract

### 6.1 Launch Set

- OpenCode: required launch target.
- Free Code: authoritative Claude-derived runtime with structured stream/control surfaces, but not admitted because its reconstructed source has no license grant and has not passed Nexus conformance.
- Free Claude Code: authoritative MIT-licensed provider proxy and launcher ecosystem, not a distinct harness. Its OpenCode launcher cannot yet compose with NexusIDE's mandatory process policy.
- Hermes: excluded from launch scope.
- OpenClaw: excluded from launch scope.

Phase 6 evaluated the authoritative candidate repositories and admitted no additional harness. See [HARNESSES.md](HARNESSES.md) for the evidence and reconsideration criteria. A provider wrapper is not a separate harness, and a machine protocol still requires licensing plus conformance evidence.

### 6.2 Required Operations

```typescript
interface CodingHarness {
  describe(): HarnessManifest;
  start(request: AgentRequest, signal: AbortSignal): AsyncIterable<AgentEvent>;
  cancel(runId: string): Promise<void>;
}

interface HarnessManifest {
  id: string;
  displayName: string;
  capabilities: Array<
    | "ask"
    | "design"
    | "read-files"
    | "edit-files"
    | "run-commands"
    | "stream-progress"
    | "cancel"
  >;
}
```

Agent events normalize text deltas, tool requests, approvals, file edits, command starts, command output, diagnostics, route metadata, completion, cancellation, and failure. Loop critics receive bounded output from failed validations as evidence, rather than relying solely on a builder narrative. Capabilities are discovered rather than inferred from a harness name.

OpenCode uses the official ACP SDK over newline-delimited JSON on supervised stdio. NexusIDE injects a restrictive runtime permission overlay, host-shell instructions, and a verified-step contract; it owns permission prompts and client file methods, and selects an advertised local or free-tier model through `session/set_config_option` before sending a prompt. Agent prompts load a bounded project `AGENTS.md` when present, and workspace attachments have a fixed aggregate budget with explicit omission notices.

Before an Agent run, NexusIDE opens an in-memory checkpoint for writes mediated through its workspace host. The Revert Last Agent Run control restores those before-images only after explicit confirmation and only while each file still matches the last agent-written content; a later user edit fails rollback rather than being overwritten. Unity MCP scene and asset changes remain outside this file-write checkpoint and retain their own tool approvals.

The three newest completed checkpoints are persisted in workspace state and survive a reload. Agent profile routing keeps an explicit Auto Stack first, then favors larger coding-capable no-cost models for coding and Unity tasks. The Unity profile retries one failed read-only operation only after reading editor state and Console logs; it never changes connection or project settings as recovery.

The context menu can attach language-service definition locations, references, and hover type information alongside files, symbols, and diagnostics. Agent activity is rendered as a structured timeline of pending, completed, failed, output, and changed steps so failed Unity operations expose their returned details.

### 6.3 File Safety

- Resolve every path canonically against a granted workspace root.
- Reject path traversal, symlink or junction escapes, device paths, alternate data streams, and writes outside allowed roots.
- Read the current file version before applying an edit.
- Present a diff when content changed since the harness read it.
- Never overwrite a dirty editor buffer silently.
- Let native file watchers surface edits made by external harness processes.

## 7. Provider Routing

The router consumes normalized provider and model records. It distinguishes provider availability from model suitability and cost.

### 7.1 Route Order

1. User-configured Auto Stack order, subject to policy and availability.
2. Healthy cloud free-tier route suitable for the requested context and tools.
3. Another configured cloud free-tier route.
4. Healthy local route such as Ollama.
5. Paid route only after explicit opt-in.

Routes are scored using health, recent throttling, context capacity, tool support, coding suitability, latency, and cost class. Retry only transient failures and honor `Retry-After`. Bound attempts and total elapsed time.

### 7.2 Cost Gate

Paid models are disabled by default. A paid route cannot become an implicit fallback from a free route. The UI must identify the provider and model before a paid request and remember consent only at the scope selected by the user.

### 7.3 Honest Availability

The UI reports local, free-tier, trial-credit, mixed, or paid status. Free-tier quotas are provider-controlled and can change. Route metadata records attempted targets, final target, fallback reason, throttling, and estimated token usage without logging prompts or secrets by default.

## 8. Workspace, Git, And Language Tooling

### 8.1 Shared Workspace

Shared workspaces are normal folders and `.code-workspace` files. NexusIDE does not copy projects into a managed Nexus data directory. Conversation metadata belongs in extension storage by default, not in the user's repository. Optional project-shared agent instructions may be committed only through an explicit user action.

### 8.2 Git And GitHub

Use Code-OSS's bundled Git extension and the system Git executable. The initial release supports repository detection, diffs, staging, commits, branches, pull, push, and credential-helper flows. GitHub-specific pull requests, issues, and OAuth are separate features and are not required for core GitHub repository use.

Agent commits and pushes always require explicit approval in the first release. Destructive Git commands are denied by default.

### 8.3 Languages

- Built in: JavaScript, TypeScript, HTML, CSS, JSON.
- Curated optional tooling: Python from reviewed Open VSX artifacts; C#/Unity from user-installed reviewed VSIX files until redistributable registry artifacts are available.
- Tool selection is verified against source and runtime licenses plus Open VSX availability before bundling. Missing optional tools are reported by the built-in readiness command.
- NexusIDE does not claim parity with proprietary Microsoft extensions unless tested and legally distributable.

## 9. State And Security

- API keys and tokens: VS Code SecretStorage only.
- Provider configuration: global extension storage.
- Ordered fallback stack: global extension storage so it follows the user across workspaces.
- Conversation state: workspace-scoped extension storage.
- Route health cache: global extension storage with expiration.
- Audit records: local, bounded, redacted, and user-clearable.
- Webviews: restrictive Content Security Policy, nonce-based scripts, no remote code.
- Telemetry: off unless separately designed with explicit consent and documented fields.

Imported NexusOS state must migrate secrets into SecretStorage and remove raw keys from the imported NexusIDE copy. NexusIDE never edits the original NexusOS state during migration.

## 10. Reliability And Performance Targets

- Workbench reaches an interactive state without waiting for providers or harnesses.
- AI extension activation does not block startup.
- Chat cancellation becomes visible within one second under normal local conditions.
- Provider failure cannot crash the extension host.
- Every retry and fallback is bounded.
- Large transcripts use virtualization and bounded persisted history.
- A missing harness or provider degrades to an actionable disconnected state.

## 11. Distribution And Updates

The first supported platform is Windows 10/11 x64. The private alpha ships a per-user Inno installer and a self-contained portable ZIP from one branded build. Both are versioned and described by SHA-256 release metadata. Private-alpha packages remain explicitly unsigned until Phase 9 signing and provenance work.

Pinokio consumes checksum-verified GitHub release artifacts and provides install, launch, update, repair, and reset actions. NexusIDE remains independently installable and does not require Pinokio at runtime.

Code-OSS upstream is pinned by tag or commit. Upstream merges happen on a regular cadence and pass the same stock-build, branded-build, extension, smoke, and packaging checks before release.

## 12. Success Criteria

A private alpha succeeds when a user can open an existing project, edit and search files, use terminal and Git, ask questions, produce a design, complete an approved coding-agent change through OpenCode, review its diff, run validation, and push the result using only no-cost routes unless they explicitly enable paid access.