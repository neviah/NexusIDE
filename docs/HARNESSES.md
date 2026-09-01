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
| FreeCode | No verifiable executable or protocol was found for this exact candidate | No authoritative package, repository, or install command | Cannot start conformance without an identifiable runtime | Unbounded identity and supply-chain risk | Rejected at gate 1 |
| Free Claude Code | No distinct authoritative product or protocol was found under this name | The closest verifiable product is official Claude Code | Claude Code has a documented headless JSON interface, but most surfaces require a subscription or billed Console account and it does not establish the requested free harness | A separate proprietary CLI adapter would duplicate lifecycle work without a verified no-cost route | Rejected at gate 1; no misleading alias added |
| Hermes | Generic chat integration evidence only | Not evaluated as a coding process | Coding operations and cancellation are unproven | Would require a new decision | Remains out of scope |
| OpenClaw | Generic chat integration evidence only | Not evaluated as a coding process | Coding operations and cancellation are unproven | Would require a new decision | Remains out of scope |

The original NexusOS repository reference was unavailable during evaluation, so it could not supply a missing executable contract for either named candidate. Public package/command discovery also found no credible FreeCode coding-agent runtime. Anthropic documents `claude -p --output-format stream-json` for automation, but its product is Claude Code, not “Free Claude Code,” and its account requirements do not support a permanent free-tier claim.

## Product Result

OpenCode remains the sole Agent-mode harness. The selector is generated from its admitted manifest; unresolved candidates are no longer shown as disabled product choices. Ask and Design continue to use Nexus provider adapters, not a partially qualified coding harness.

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
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code overview and account requirements](https://code.claude.com/docs/en/overview)