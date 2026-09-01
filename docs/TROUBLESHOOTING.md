# Troubleshooting

## Export Support Diagnostics

Run **NexusIDE: Export Support Diagnostics** from the Command Palette and choose a destination. The JSON report includes versions, platform, workspace trust, provider health status, recovery detection, and log locations. It excludes conversation text, workspace contents, environment values, and credentials.

## Windows Blocks The Installer

Alpha artifacts are unsigned. Beta and stable artifacts must have a valid Authenticode signature. Always verify the SHA-256 value against `SHA256SUMS`; a mismatch is a hard stop.

## Nexus AI Is Missing

Run `NexusIDE: Show Running Extensions` and confirm Nexus AI is present. For portable builds, keep the extracted directory intact; moving only `NexusIDE.exe` omits bundled resources.

## No AI Models Appear

Open Nexus Router and refresh providers. Confirm Ollama is running or refresh the cloud credential. Disabled, cooling-down, exhausted, paid, trial, and ambiguously priced routes are excluded by default.

## Agent Mode Will Not Start

Trust the workspace, install OpenCode with `npm install -g opencode-ai`, and restart NexusIDE. Set `nexusAI.openCodePath` only when the executable is outside the normal npm location or `PATH`.

## Language Tooling Is Unavailable

Run `NexusIDE: Check Language Tooling`. The report distinguishes missing runtimes from missing reviewed extensions and gives setup steps for Python, .NET, and Unity.

## Pinokio Install Or Update Fails

Open the failed script in Pinokio and inspect its terminal log. Confirm GitHub is reachable and that the latest release contains `release.json` and a versioned portable ZIP. Repair re-downloads and checksum-validates the current release, Roll Back restores the prior verified local copy, and Reset removes both copies.