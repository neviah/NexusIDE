# NexusIDE Architecture Decisions

This log records decisions that materially affect scope, maintenance, security, or product behavior. New entries are append-only; superseded decisions point to their replacements.

## ADR-001: Use Code-OSS As The Product Foundation

**Status:** Accepted

**Decision:** Build a standalone NexusIDE distribution from Code-OSS instead of adding Monaco and recreating IDE services inside NexusOS.

**Reason:** Code-OSS already owns the difficult, mature editor, terminal, file, Git, debug, task, and language-service behavior. Reimplementing those capabilities would delay the product and create permanent compatibility work.

**Consequence:** NexusIDE must regularly merge upstream changes and preserve required licenses and notices.

## ADR-002: Keep The Fork Thin

**Status:** Accepted

**Decision:** Put Nexus functionality in a bundled extension and reusable packages. Modify workbench source only when a public extension API cannot meet a documented requirement.

**Reason:** Upstream merge cost grows with every behavioral patch.

**Consequence:** Some visual customization may remain within native extension API limits.

## ADR-003: Use The Secondary Side Bar For Nexus AI

**Status:** Accepted

**Decision:** Explorer remains in the left Primary Side Bar, editors remain central, and Nexus AI opens in the right Secondary Side Bar. Harness selection lives inside the chat UI.

**Reason:** This matches the requested VS Code-like workflow and avoids an Activity Bar entry per harness.

## ADR-004: Separate Harnesses From Providers

**Status:** Accepted

**Decision:** A coding harness controls agent execution; a provider/model supplies inference. Users may select them independently when the harness supports external model routing.

**Reason:** Treating model endpoints as harnesses obscures capabilities and makes routing brittle.

## ADR-005: Narrow The Launch Harness Set

**Status:** Accepted

**Decision:** OpenCode is required. FreeCode and Free Claude Code are candidates pending conformance. Hermes and OpenClaw are excluded from launch scope.

**Reason:** NexusOS explicitly identifies OpenCode, FreeCode, and Free Claude Code as coding-focused. Existing generic chat endpoint configuration does not prove coding operations for Hermes or OpenClaw.

**Consequence:** A reusable conformance suite, rather than product naming, controls Agent-mode eligibility.

## ADR-006: Do Not Depend On Microsoft's Extension Marketplace

**Status:** Accepted

**Decision:** The first release uses built-in extensions and curated redistributable tooling. A marketplace is not required.

**Reason:** The product does not need broad marketplace access, and Microsoft marketplace usage introduces licensing and product-dependency concerns.

**Consequence:** Python and C#/Unity tooling must be selected, licensed, packaged, and tested deliberately.

## ADR-007: Route Free First With A Hard Paid Boundary

**Status:** Accepted

**Decision:** Prefer suitable local and verified free-tier routes. Paid routes are disabled by default and require explicit consent.

**Reason:** Predictable zero-cost operation is a core product goal, while cloud free tiers remain quota-limited and changeable.

**Consequence:** The UI must expose cost class, quota uncertainty, final route, and fallback behavior.

## ADR-008: Use Ordinary Folders As Shared Workspaces

**Status:** Accepted

**Decision:** NexusIDE and external harnesses operate on ordinary folders and `.code-workspace` files. NexusIDE does not replace Code-OSS workspace services or require projects under Nexus-managed storage.

**Reason:** Native file watching and Git behavior already support interoperable tools and avoid lock-in.

**Consequence:** Concurrent-edit and dirty-buffer conflict handling are release requirements.

## ADR-009: Keep Routing In The Extension Host Initially

**Status:** Proposed

**Decision:** Start without a separate NexusIDE backend service. Introduce a supervised local service only when process isolation, native dependencies, multi-client sharing, or harness lifecycle management requires it.

**Reason:** A daemon adds installation, ports, startup ordering, authentication, logging, and recovery work.

**Validation:** The OpenCode prototype must demonstrate whether extension-host process supervision and streaming are sufficient.

## ADR-010: Exclude NexusOS Media Systems

**Status:** Accepted

**Decision:** Do not import media generators, 3D pipelines, Blender automation, TTS, or game-asset creation into NexusIDE.

**Reason:** They do not support the product's pure coding scope and would increase dependencies and startup complexity.

**Consequence:** C#/Unity editing and debugging remain in scope as coding workflows.