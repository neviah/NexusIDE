# Troubleshooting

## Windows Blocks The Installer

Private-alpha artifacts are unsigned. Verify the SHA-256 value against `SHA256SUMS`, then use the SmartScreen details option only when it matches. A mismatched checksum is a hard stop.

## Nexus AI Is Missing

Run `NexusIDE: Show Running Extensions` and confirm Nexus AI is present. For portable builds, keep the extracted directory intact; moving only `NexusIDE.exe` omits bundled resources.

## No AI Models Appear

Open Nexus Router and refresh providers. Confirm Ollama is running or refresh the cloud credential. Disabled, cooling-down, exhausted, paid, trial, and ambiguously priced routes are excluded by default.

## Agent Mode Will Not Start

Trust the workspace, install OpenCode with `npm install -g opencode-ai`, and restart NexusIDE. Set `nexusAI.openCodePath` only when the executable is outside the normal npm location or `PATH`.

## Language Tooling Is Unavailable

Run `NexusIDE: Check Language Tooling`. The report distinguishes missing runtimes from missing reviewed extensions and gives setup steps for Python, .NET, and Unity.

## Pinokio Install Or Update Fails

Open the failed script in Pinokio and inspect its terminal log. Confirm GitHub is reachable and that the latest release contains `release.json` and a versioned portable ZIP. Repair re-downloads and checksum-validates the current release; Reset removes the installed app.