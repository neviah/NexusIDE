# Private Alpha Setup

## Install On Windows

1. Download `NexusIDEUserSetup-x64-<version>.exe` and `SHA256SUMS` from the same GitHub release.
2. Run `Get-FileHash .\NexusIDEUserSetup-x64-<version>.exe -Algorithm SHA256` and compare the result with `SHA256SUMS`.
3. Start the installer. It installs for the current user and does not require administrator access.
4. Windows SmartScreen may show an unknown-publisher warning because private-alpha builds are unsigned. Continue only when the checksum matches the release.

For portable use, extract `NexusIDE-win32-x64-<version>.zip` to a writable folder and run `NexusIDE.exe`. Its settings and extensions remain in the adjacent `data` directory.

## Configure A Free Route

- Local: install and start Ollama, then select an available Ollama model in Nexus Router.
- Cloud: open Nexus Router, add a Groq key or OpenRouter key, refresh models, and choose only a free-tier route. OpenRouter models must be explicitly marked `:free`.

Open a folder, trust it only when you know its contents, and use Ask or Design first. Agent mode additionally requires OpenCode: `npm install -g opencode-ai`. Every edit and command remains approval-gated.

## Pinokio

With Pinokio configured, run `./scripts/install-pinokio-launcher.ps1` from a checkout. Open the NexusIDE tile and choose Install. Launch, Update, Repair, and Reset are then one-click actions.

## Uninstall

Use Windows Settings > Apps > Installed apps > NexusIDE > Uninstall. Portable users can delete the extracted folder. Pinokio users can choose Reset and remove the launcher tile.