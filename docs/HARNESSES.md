# NexusIDE Harness Evaluation

Last evaluated: 2026-09-01

## Admission Process

A name is not enough to enter Agent mode. Candidates advance through four gates:

1. Identify a maintained executable, installation source, license, and documented machine interface.
2. Advertise every required Agent capability through the normalized manifest.
3. Pass deterministic read, permission, two-file edit, command, failed-validation recovery, cancellation, redaction, and change-reporting tests.
4. Pass a model-free startup smoke test and an opt-in local or verified-free end-to-end smoke test.

Failure at an earlier gate stops evaluation. NexusIDE does not install an ambiguous package or spend money merely to probe a product name.

## Phase 6 Results

| Candidate | Capability | Setup | Reliability and control | Maintenance | Decision |
| --- | --- | --- | --- | --- | --- |
| OpenCode `1.16.2` | Full coding lifecycle over ACP | One global package or configured executable | Supervised stdio, explicit permissions, cancellation, and advertised model selection | One official ACP adapter and SDK | Admitted; reference harness |
| Free Code `2.1.87` | Claude-derived agent with `--print --output-format=stream-json`, structured stdio controls, permission callbacks, cancellation, and native file/command tools | Build from `freecodexyz/free-code` with Bun; macOS/Linux, Windows through WSL; provider authentication still required | Host permission delegation appears possible, but the exact stream and control contract has not passed Nexus conformance | Package manifest is marked private and the source was reconstructed from an exposed source map; no `LICENSE` grant is present and the README says the original source is Anthropic property | Not admitted; redistribution gate fails before runtime conformance |
| Free Claude Code `5.18.11` | Local OpenAI/Anthropic-compatible provider proxy plus launchers for existing agents; `fcc-opencode acp` still uses OpenCode ACP | MIT-licensed Python package with Windows installer; requires Python 3.14, OpenCode 1.18.18+, and a separately running `fcc-server` | Launcher is fail-closed and process-local, but rejects inherited `OPENCODE_CONFIG_CONTENT`, which NexusIDE uses to enforce its OpenCode policy | Reusing the OpenCode adapter is preferable to maintaining a duplicate harness; proxy/provider compatibility remains independently testable | Classified as a provider route, not a distinct harness; not integrated until policy composition is possible |
| Hermes | Generic chat integration evidence only | Not evaluated as a coding process | Coding operations and cancellation are unproven | Would require a new decision | Remains out of scope |
| OpenClaw | Generic chat integration evidence only | Not evaluated as a coding process | Coding operations and cancellation are unproven | Would require a new decision | Remains out of scope |

The authoritative repositories are `Alishahryar1/free-claude-code` and `freecodexyz/free-code`. Their names obscure an important architectural difference: Free Claude Code supplies inference routing to other coding agents, while Free Code is a separate agent runtime. A free build also does not establish free inference; Free Code documents authenticated Anthropic, OpenAI, Bedrock, Vertex, and Foundry routes.

Free Claude Code's OpenCode launcher forwards `acp`, fetches the live proxy model catalog, and creates a temporary `free-claude-code` provider. It is therefore compatible with the same machine protocol in principle. It cannot currently replace `opencode` in NexusIDE, however: the launcher intentionally rejects inherited `OPENCODE_CONFIG` and `OPENCODE_CONFIG_CONTENT`, while NexusIDE injects the latter to force edit, command, publishing, and external-directory policy. Removing that policy just to make the launcher start is not an acceptable integration.

Free Code's structured I/O includes a stdio permission-prompt path and control messages, so it is not rejected for lacking a protocol or for merely removing prompt text. Its repository has no license file or package license identifier and explicitly describes the original source as Anthropic property. NexusIDE will neither redistribute nor build an adapter around that source without a valid license grant. Its Windows-through-WSL setup and lack of a verified free default route are additional private-alpha drawbacks.

## Product Result

OpenCode remains the sole Agent-mode harness. Free Claude Code is tracked as a possible provider route through OpenCode rather than exposed as a duplicate harness choice. Free Code remains a known but unadmitted runtime. The selector is generated from the admitted manifest; unresolved candidates are not shown as disabled product choices. Ask and Design continue to use Nexus provider adapters, not a partially qualified coding harness.

The core qualification helper classifies complete manifests as Agent-capable, incomplete manifests with `ask` as Ask-only, and unidentified manifests as ineligible. Behavioral conformance remains mandatory in addition to this structural check.

## Reconsideration

A rejected candidate may be reconsidered when an authoritative source provides all of the following:

- A stable executable and documented IPC, ACP, SDK, or structured streaming contract.
- License and redistribution terms suitable for NexusIDE.
- Explicit permission, workspace-boundary, cancellation, and model-selection behavior.
- A legitimate local or verified-free route for the default smoke test.
- Deterministic fixtures that pass the complete OpenCode conformance lifecycle.

Sources checked on 2026-09-01:

- [OpenCode ACP support](https://opencode.ai/docs/acp/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [Free Claude Code repository](https://github.com/Alishahryar1/free-claude-code)
- [Free Claude Code OpenCode launcher](https://github.com/Alishahryar1/free-claude-code/blob/main/src/free_claude_code/cli/launchers/opencode.py)
- [Free Code repository](https://github.com/freecodexyz/free-code)
- [Free Code structured I/O](https://github.com/freecodexyz/free-code/blob/main/src/cli/structuredIO.ts)