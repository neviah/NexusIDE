# @nexus/ai-core

Framework-independent provider contracts and free-first routing for NexusIDE.

## Boundaries

- No Code-OSS, VS Code, React, Express, or NexusOS global-state dependency.
- No credential persistence. Hosts implement `SecretStore`; the Nexus AI extension uses VS Code `SecretStorage`.
- No prompt, source, credential, or full provider-error logging.
- No paid, mixed, or trial route without consent matching the exact provider and model.

## Included

- Normalized provider, model, health, completion, stream, route, and error contracts.
- Ollama `/api/tags` discovery and `/api/chat` NDJSON streaming.
- Generic OpenAI-compatible model discovery and SSE chat streaming.
- Groq configuration through the generic OpenAI-compatible transport.
- Deterministic free-first scoring, bounded retry, fallback, cancellation, and redaction.
- Contract fixtures for OpenAI-compatible SSE, Ollama NDJSON, malformed payloads, throttling, and cancellation.

## Validation

```powershell
./scripts/build-ai-core.ps1
```

Tests use injected fetch implementations and make no paid or live provider requests.