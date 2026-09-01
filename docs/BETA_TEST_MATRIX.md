# Public Beta Test Matrix

## Automated Gates

| Area | Evidence |
| --- | --- |
| Accessibility | Chat controls carry accessible names, mode buttons expose pressed state, output uses an `aria-live` region, and Enter/Shift+Enter keyboard behavior is registered. |
| Large workspaces | A 10,000-entry synthetic context test proves the provider payload remains capped at 32,000 characters. |
| Offline operation | Empty discovery returns the normalized `no-routes` result without selecting a paid route. |
| Provider degradation | Throttled routes enter cooldown, fall back once, and are excluded from the next request. |
| Migration and recovery | Legacy conversations migrate into the bounded document shape; malformed state is discarded; unclean startup is detected and the next clean shutdown is recorded. |
| Support diagnostics | Recursive tests remove credential fields, prompts, bearer values, and API-key-shaped values. |
| Security | Dependency audit, dependency review, Gitleaks, workspace containment, approval, and paid-route tests run in CI. |
| Upstream maintenance | `rehearse-upstream-merge.ps1` fetches the configured branch and uses `git merge-tree` without modifying the submodule worktree. |

## Release Candidate Checks

Run these on clean Windows 10 and Windows 11 virtual machines before promoting a beta tag:

1. Verify the installer and `NexusIDE.exe` Authenticode status is `Valid`.
2. Install as a standard user into a path containing spaces and non-ASCII characters.
3. Navigate every Nexus AI control by keyboard and verify screen-reader announcements for streamed output and errors.
4. Open a repository with at least 100,000 files and confirm search, source control, terminal, and bounded AI context remain responsive.
5. Disconnect the network, verify local Ollama operation, and verify cloud-only routing reports no eligible route.
6. Force one cloud route to return HTTP 429 and confirm free-route fallback and cooldown display.
7. Terminate NexusIDE during an active request, restart it, and verify the recovery notice and persisted completed conversations.
8. Update through Pinokio, disconnect the network, and use Roll Back to restore the prior verified installation.

Record VM image, Windows build, artifact hashes, result, and issue links in the release notes. Any critical security issue, invalid signature, data loss, paid-route bypass, or failed rollback blocks promotion.