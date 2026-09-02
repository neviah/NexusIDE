# NexusIDE Provider Strategy

## Purpose

NexusIDE should combine local inference and legitimate provider free tiers without coupling the product to one vendor. Provider quotas, model catalogs, and terms change frequently, so this document defines integration policy rather than promising permanent allowances.

## Provider Classes

| Class | Examples | Default policy |
| --- | --- | --- |
| Local | Ollama, LM Studio, llama.cpp servers | Preferred when healthy and suitable |
| Free tier | Provider grants recurring no-cost quota | Eligible for automatic free-first routing |
| Trial credit | Temporary promotional balance | Disabled from Auto unless user opts in |
| Mixed | Free and paid models share one API | Only explicitly verified free models are eligible |
| Paid | Usage incurs cost | Disabled until explicit user opt-in |

## Integrated Providers

- Ollama: implemented as the local baseline for offline development.
- Custom OpenAI-compatible endpoint: covers LM Studio, local gateways, and self-hosted servers.
- OpenRouter: implemented with live model discovery; only models with explicitly zero prompt, completion, and request prices enter Auto routing.
- Groq: implemented through its OpenAI-compatible API with account-specific free limits.
- NVIDIA NIM, Google Gemini, Cerebras, and Mistral AI: implemented through their OpenAI-compatible APIs and classified as provider-controlled free tiers.
- GitHub Models: retained in the catalog as unavailable because GitHub retired the service on July 30, 2026.
- Hugging Face: implemented for secure configuration and discovery, but classified as trial because its monthly allowance is credit-metered.
- SambaNova: implemented for secure configuration and discovery; current service eligibility remains provider-controlled and must not be described as unlimited.

The catalog is grounded in [mnfst/awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis), with endpoint and terms reviewed again when NexusIDE changes an adapter. The Nexus Router stores credentials through VS Code SecretStorage, discovers available models, checks health, shows advisory quota and cooldown state, and lets the user order routes used by Auto. Ollama remains usable without credentials. The custom endpoint is disabled initially, uses a loopback URL by default, permits an optional API key, and is classified as local.

### Next Provider Candidates

- Cloudflare Workers AI where the user's account supplies an eligible allowance.
- LLM7.io keyless and token tiers.
- ModelScope and SiliconFlow, subject to regional identity requirements.
- Ollama Cloud, Kilo Code, Aion Labs, Z AI, and OVHcloud AI Endpoints.

This is a candidate list, not a claim that each provider will retain a free tier. Providers needing account IDs, nonstandard model discovery, native protocols, or regional identity checks require dedicated configuration and tests before admission.

### Not A Provider Contract

NexusOS catalog entries such as iFlow, Qwen Code, Gemini CLI, and Kiro AI currently describe local gateway profiles at one localhost endpoint. NexusIDE should not present those labels as direct providers until the gateway protocol, installation source, authentication, and terms are documented and tested.

## Normalized Contract

```typescript
type CostClass = "local" | "free-tier" | "trial" | "mixed" | "paid";

interface ProviderAdapter {
  manifest(): ProviderManifest;
  authenticate(secretStore: SecretStore): Promise<AuthStatus>;
  listModels(signal: AbortSignal): Promise<ModelDescriptor[]>;
  health(signal: AbortSignal): Promise<ProviderHealth>;
  stream(request: CompletionRequest, signal: AbortSignal): AsyncIterable<CompletionEvent>;
}

interface ModelDescriptor {
  id: string;
  costClass: CostClass;
  contextTokens?: number;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  codingScore?: number;
  verifiedAt: string;
}
```

OpenAI wire compatibility does not eliminate provider-specific differences. Authentication, model discovery, usage headers, error bodies, tool schemas, and rate-limit metadata remain adapter responsibilities.

## Free-First Policy

### Eligibility

A route is eligible for automatic free-first use only when:

- The user configured or enabled it.
- Its cost class is local or currently verified free-tier.
- The model supports capabilities required by the selected harness and mode.
- It is not in cooldown after throttling or repeated failure.
- The request fits known context and output limits.

### Scoring

Eligible routes are ranked by:

1. Required tool and structured-output support.
2. Coding suitability.
3. Current health and recent success rate.
4. Remaining quota information when providers expose it.
5. Context capacity.
6. Latency.
7. User priority.

Use deterministic weights stored in code and expose the reason for the winning route. Do not market the scoring system as intelligent until it is measured against real coding tasks.

### Fallback

- Retry only transient network errors, 408, 409, 425, 429, and selected 5xx responses.
- Honor `Retry-After` within a bounded total wait.
- Move to the next eligible free route after the retry budget.
- Never cross into trial, mixed-cost unknown, or paid routes without matching user consent.
- Preserve one run ID across attempts and expose the fallback chain in route details.

## Quota Handling

Providers expose quotas inconsistently. NexusIDE should support:

- Standard rate-limit and `Retry-After` headers.
- Adapter-specific usage headers.
- User-entered quota notes where no API exists.
- Cooldown estimates after 429 responses.
- A visible Unknown state rather than invented remaining capacity.

OpenAI-compatible adapters normalize request-limit headers when present. Missing headers remain Unknown, and cloud free tiers are always described as limited by provider/account policy, never unlimited.

Quota tracking is advisory. The provider response remains authoritative.

## Credentials

- Use VS Code SecretStorage.
- Keep separate credentials per provider and account label.
- Do not send credentials to the webview, coding harness, or another provider.
- Let users test and delete credentials.
- Support providers that need browser/device authentication only through a reviewed flow with state and callback validation.

## Provider Admission Checklist

1. Verify official API documentation and terms on the implementation date.
2. Confirm desktop/client use and key handling are allowed.
3. Document the actual free-tier or trial classification.
4. Implement model discovery or a versioned catalog fallback.
5. Normalize streaming, errors, usage, cancellation, and tool support.
6. Add mocked contract tests and an opt-in live smoke test.
7. Verify secret redaction and paid-route blocking.
8. Add setup and troubleshooting documentation.

## Live Verification

Mocked contract tests prove NexusIDE handles a provider's protocol; they cannot prove the endpoint still exists or that a key still works. `scripts/test-live-smoke.ps1` closes that gap and is opt-in, because it needs network access and real credentials.

It reads credentials only from environment variables, never from SecretStorage, and exercises only `local` and `free-tier` routes. Trial, mixed, and paid routes are refused before any request is streamed, so a run cannot bill the user. Each provider is taken through credentials, health, discovery, and a real streamed completion with a minimal prompt and a small output budget.

Outcomes are deliberately distinct:

- `passed`: the provider streamed real text and completed.
- `skipped`: no credentials, or no no-cost model offered. Nothing is proven, and a run where everything skipped is not a pass.
- `failed`: the provider is configured but did not work.

Only the streamed completion is conclusive. Several providers serve model discovery from a public endpoint, so credential and health checks can succeed with an invalid key and fail only at generation time. Set `NEXUS_SMOKE_MCP_URL` to additionally verify that an MCP server, such as Unity, initializes and reports tools.

## Observability

Store bounded, redacted operational data:

- Provider and model identifiers.
- Request start/end times and latency.
- Status category, retry count, and fallback reason.
- Token usage when reported.
- Cost class and whether paid consent was present.

Do not store prompts, generated code, source attachments, authorization data, or full provider error bodies by default.