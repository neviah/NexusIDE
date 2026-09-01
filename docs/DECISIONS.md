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

**Decision:** OpenCode is the sole admitted launch harness. FreeCode is rejected because no authoritative runtime contract could be identified. Free Claude Code is rejected because no distinct product could be identified and official Claude Code does not establish a permanent free harness. Hermes and OpenClaw remain excluded.

**Reason:** Phase 6 applied identity, capability, deterministic conformance, and smoke gates. Only OpenCode reached and passed all gates. Product labels and generic chat endpoints are not evidence of coding operations.

**Consequence:** Agent mode lists only the admitted OpenCode manifest. Future candidates require authoritative provenance and the same complete conformance evidence; see [HARNESSES.md](HARNESSES.md).

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

## ADR-011: Apply Product Branding As A Build Overlay

**Status:** Accepted

**Decision:** Keep NexusIDE product configuration and brand assets in the root repository. Packaging temporarily merges them into the clean Code-OSS worktree, runs the upstream package task, and restores every upstream file byte-for-byte in a `finally` block.

**Reason:** Upstream development supports `product.overrides.json`, but packaged builds consume `product.json` and Windows resources directly. A deterministic overlay preserves the pinned submodule while using the upstream packaging pipeline.

**Consequence:** Packaging fails closed when the submodule has tracked changes. No Code-OSS workbench source modification is required.

## ADR-012: Correct Candidate Harness Classification

**Status:** Accepted; supersedes ADR-005's candidate rationale

**Decision:** Keep OpenCode as the sole admitted harness. Classify Free Claude Code as a provider proxy and launcher ecosystem rather than a distinct harness. Do not integrate its OpenCode launcher until it can compose with NexusIDE's mandatory `OPENCODE_CONFIG_CONTENT` policy. Do not admit or redistribute Free Code without a valid license grant and complete conformance evidence.

**Reason:** The authoritative repositories invalidate ADR-005's provenance assumptions. `fcc-opencode acp` reuses OpenCode's ACP lifecycle but rejects the process configuration NexusIDE uses to force safety policy. Free Code exposes a structured stream and stdio permission controls, but its repository provides no license grant, requires authenticated inference, and supports Windows only through WSL.

**Consequence:** No misleading duplicate harness appears in Agent mode and no safety setting is dropped to gain provider compatibility. Both candidates may be reconsidered when the specific blocker is resolved; see [HARNESSES.md](HARNESSES.md).

## ADR-013: Keep Language Tooling Optional And License-Gated

**Status:** Accepted

**Decision:** Approve the MIT `ms-python.python` Open VSX artifact as the Python entry point, with `ms-python.debugpy` required for debugging. Do not bundle C# Dev Kit, Marketplace-only C# runtime components, or the official Unity extension. Detect optional runtimes and extensions and provide exact setup guidance.

**Reason:** Built-in web language services already ship with Code-OSS. Python has a verified Open VSX path. The official C# and Unity IDs are absent from Open VSX, and C# ships runtime components under terms beyond the MIT source license. Automatic Marketplace downloads would violate the distribution boundary established in ADR-006.

**Consequence:** Git and web workflows work out of the box. Python, C#, and Unity capabilities are honest and testable on equipped hosts without making unavailable proprietary components a launch dependency. See [LANGUAGES.md](LANGUAGES.md).

## ADR-014: Ship The Private Alpha As Unsigned Per-User And Portable Artifacts

**Status:** Accepted

**Decision:** Build a lowest-privilege Inno user installer and portable ZIP from the same branded Code-OSS staging directory. Publish version, commit, sizes, and SHA-256 hashes with every release. Pinokio installs only checksum-verified portable release assets.

**Reason:** A per-user installer supports non-admin alpha testers, while the portable package supports removable and Pinokio-managed installs. Reusing upstream Inno packaging avoids a second installer implementation. Code signing and provenance require release infrastructure reserved for Phase 9.

**Consequence:** Private-alpha users see an explicit unknown-publisher warning and must verify checksums. Clean Windows CI tests package structure plus silent installation and uninstallation before tagged prereleases are published. See [PACKAGING.md](PACKAGING.md).

## ADR-015: Fail Closed For Signed Channels And Attest Every Release

**Status:** Accepted

**Decision:** Keep unsigned alpha builds available for development, but require a valid Authenticode signature for beta and stable channels. Bind artifacts to NexusIDE and upstream commits in `release.json`, and publish GitHub OIDC build-provenance attestations.

**Reason:** A public channel must not silently degrade to unknown-publisher binaries when signing material is missing. Checksums prove integrity after publication; signatures and attestations additionally identify publisher and build origin.

**Consequence:** Public beta publication remains blocked until the trusted PFX and password are provisioned as repository secrets. Pinokio retains one checksum-verified previous install so rollback does not depend on network availability. See [RELEASE_CHANNELS.md](RELEASE_CHANNELS.md).