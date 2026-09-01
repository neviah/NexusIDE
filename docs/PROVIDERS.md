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

## Initial Integrations

### Tier 1: Build First

- Ollama: implemented as the local baseline for offline development.
- Custom OpenAI-compatible endpoint: covers LM Studio, local gateways, and self-hosted servers.
- OpenRouter: implemented with live model discovery; only models with explicitly zero prompt, completion, and request prices enter Auto routing.
- Groq: implemented through its OpenAI-compatible API with account-specific free limits.

The Nexus Router Activity Bar view stores cloud credentials through VS Code SecretStorage, discovers available models, and lets the user order the routes used by Auto. Ollama remains usable without credentials. Catalog eligibility is re-evaluated during discovery; NexusIDE does not infer free status from model names.

### Tier 2: Evaluate During Provider Expansion

- Google Gemini API.
- Cerebras Inference.
- SambaNova Cloud.
- Mistral API.
- GitHub Models, subject to authentication, redistribution, and usage terms.
- Hugging Face inference services.
- Cloudflare Workers AI where the user's account supplies an eligible allowance.

This is a candidate list, not a claim that each provider will retain a free tier. Before implementation, verify current API documentation, allowed client types, rate limits, model availability, regional restrictions, data terms, and whether a user-supplied key may be used in a desktop application.

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

## Observability

Store bounded, redacted operational data:

- Provider and model identifiers.
- Request start/end times and latency.
- Status category, retry count, and fallback reason.
- Token usage when reported.
- Cost class and whether paid consent was present.

Do not store prompts, generated code, source attachments, authorization data, or full provider error bodies by default.