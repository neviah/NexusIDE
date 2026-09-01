# Packaging And Release

`scripts/build-portable.ps1` overlays NexusIDE branding, builds Code-OSS, bundles Nexus AI, and emits four files under `.runtime/artifacts`:

- `NexusIDEUserSetup-x64-<version>.exe`: unsigned per-user Inno Setup installer.
- `NexusIDE-win32-x64-<version>.zip`: portable build with an adjacent `data` directory.
- `release.json`: version, commit, unsigned status, sizes, and SHA-256 hashes.
- `SHA256SUMS`: human-readable checksums.

The distribution omits Code-OSS's upstream Copilot extension. Nexus AI is the supported AI surface, and excluding the duplicate extension also avoids shipping its deeply nested development dependency tree.

Run `scripts/test-phase8-artifacts.ps1` after packaging. Run `scripts/test-phase8-installer.ps1 -InstallerPath <path>` to exercise silent non-admin install, executable startup, and uninstall under a path containing spaces and non-ASCII characters.

The CI workflow tests Nexus packages, Git/language workflows, launcher generation, dependency changes, and committed secrets. The release workflow packages on a clean Windows runner, runs both artifact gates, uploads workflow artifacts, and creates a prerelease for tags matching `v*-alpha.*`.

Code signing and production provenance are Phase 9 work. Do not describe Phase 8 artifacts as signed or suppress Windows security warnings.