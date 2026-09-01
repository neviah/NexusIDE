# Code-OSS Upstream Maintenance

## Current Pin

- Repository: `https://github.com/microsoft/vscode.git`
- Release branch: `release/1.136`
- Product version: `1.136.0`
- Commit: `6b83849594a181ba0dcadea99844b6f1f42bbcc9`
- Required Node.js: `24.18.0`

The gitlink commit, not the branch name, is the reproducibility boundary. The branch setting exists only to simplify intentional updates.

## Fresh Checkout

```powershell
git clone --recurse-submodules https://github.com/neviah/NexusIDE.git
Set-Location NexusIDE
./scripts/bootstrap.ps1
./scripts/compile-code-oss.ps1
```

## Intentional Update

1. Review the new stable release branch, release notes, `.nvmrc`, `.npmrc`, `package.json`, `product.json`, extension API changes, and license notices.
2. Fetch and detach the submodule at a reviewed commit.
3. Update the recorded values in this document and [STATUS.md](STATUS.md).
4. Run the stock compile before applying or debugging NexusIDE overlays.
5. Run extension, smoke, packaging, and migration checks.
6. Commit the gitlink update separately from behavioral changes.

Example commands:

```powershell
git -C code-oss fetch origin refs/heads/release/NEW_VERSION
git -C code-oss checkout --detach REVIEWED_COMMIT
./scripts/bootstrap.ps1
./scripts/compile-code-oss.ps1
git add code-oss docs/UPSTREAM.md docs/STATUS.md
```

## Modification Rule

Do not commit changes directly inside the upstream submodule. NexusIDE behavior belongs in root-level packages, a bundled extension, product override files, or small reviewed patch files applied by automation. Any unavoidable workbench patch requires an architecture decision record and its own upstream-merge test.

## Merge Rehearsal

Run `./scripts/rehearse-upstream-merge.ps1` before a release and before changing the pin. It fetches the configured release branch into a temporary remote ref and uses `git merge-tree`; it never checks out or modifies upstream files. The JSON result is written to `.runtime/upstream-merge-rehearsal.json`.

The Phase 9 rehearsal on 2026-09-01 merged pinned commit `6b83849594a181ba0dcadea99844b6f1f42bbcc9` with current `release/1.136` commit `3bd765c1e25dc37d0621887cedfed5ca75af97dd` without conflicts or worktree changes. Because NexusIDE carries no submodule source patches, expected update cost remains dependency/bootstrap validation, product-overlay verification, extension API compilation, and the full release test matrix.