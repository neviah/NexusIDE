# Privacy

NexusIDE does not add product telemetry to Code-OSS. AI requests are sent only to the route selected in Nexus Router. Supported routes include local Ollama, a user-configured compatible endpoint, and explicitly configured cloud providers shown in the Provider Catalog.

Provider credentials are stored through VS Code SecretStorage. They are not written to workspace files, ordinary extension state, logs, prompts, or release artifacts. Operational logs redact known credentials and prompt content.

Ask and Design send only the prompt and context attachments shown for that turn. Agent mode may read files and run commands inside a trusted workspace after native approval prompts. Canonical path checks deny access outside the granted workspace, and destructive or publishing commands fail closed.

Cloud providers receive submitted prompt content and attachments under their own privacy terms. Use Ollama for a local-only route. NexusIDE cannot make a third-party cloud service private or unlimited.

The user-initiated support diagnostics export contains versions, platform, workspace trust/count, provider health labels, recovery state, and local log locations. It does not include conversation text, workspace file contents, environment values, or credentials; sensitive field names and token-shaped strings are recursively redacted before writing.