# NexusIDE Status

Last updated: 2026-09-01

## Current Milestone

Phase 0: Repository and upstream spike.

## Completed

- NexusIDE repository created and published at `neviah/NexusIDE`.
- Architecture, delivery phases, provider policy, guardrails, and decisions documented.
- Code-OSS `1.136.0` selected from `release/1.136`.
- Upstream commit pinned as submodule: `6b83849594a181ba0dcadea99844b6f1f42bbcc9`.
- Required Node.js version verified from upstream: `24.18.0`.
- Visual Studio Build Tools 2022, Visual C++ x64 tools, Windows 11 SDK, Python, and Git detected locally.
- Portable Node `24.18.0` downloaded and prerequisite checks added.

## Blocked Gate

Code-OSS native dependency installation requires the Visual Studio component **MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)**. Open Visual Studio Installer, choose **Modify** for Build Tools 2022, open **Individual components**, search for `Spectre`, install that component, and rerun `./scripts/bootstrap.ps1`.

The component requires an elevated Visual Studio Installer operation and is intentionally not installed by project automation.

## Next

- Record the successful stock launch command and artifact locations.
- Add NexusIDE product identity through supported product overrides.
- Scaffold the bundled Nexus AI extension and prove placement in the Secondary Side Bar.

## Phase 0 Exit Gate

- [x] Remote repository configured.
- [x] Stable upstream version and commit pinned.
- [x] Tool requirements derived from upstream files.
- [x] Reproducible bootstrap scripts created.
- [ ] Clean dependency installation succeeds.
- [ ] Stock Code-OSS compilation succeeds.
- [ ] Stock Code-OSS launches on Windows.