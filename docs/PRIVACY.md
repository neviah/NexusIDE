# Privacy

NexusIDE does not add product telemetry to Code-OSS. AI requests are sent only to the route selected in Nexus Router: local Ollama, Groq, OpenRouter, or a user-configured compatible endpoint.

Provider credentials are stored through VS Code SecretStorage. They are not written to workspace files, ordinary extension state, logs, prompts, or release artifacts. Operational logs redact known credentials and prompt content.

Ask and Design send only the prompt and context attachments shown for that turn. Agent mode may read files and run commands inside a trusted workspace after native approval prompts. Canonical path checks deny access outside the granted workspace, and destructive or publishing commands fail closed.

Cloud providers receive submitted prompt content and attachments under their own privacy terms. Use Ollama for a local-only route. NexusIDE cannot make a third-party cloud service private or unlimited.