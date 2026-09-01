const SENSITIVE_KEYS = /^(authorization|api[-_]?key|token|secret|password|prompt|messages?|content|source)$/i;

export function redactText(value: string, secrets: readonly string[] = []): string {
    let redacted = value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
        .replace(/((?:^|[?&\s])(?:api[_-]?key|token|access_token)=)[^&#\s]+/gi, "$1[REDACTED]")
        .replace(/("(?:api[_-]?key|token|secret|password|authorization)"\s*:\s*")[^"]+/gi, "$1[REDACTED]");

    for (const secret of secrets) {
        if (secret) {
            redacted = redacted.split(secret).join("[REDACTED]");
        }
    }
    return redacted;
}

export function redactOperationalValue(value: unknown, secrets: readonly string[] = []): unknown {
    if (typeof value === "string") {
        return redactText(value, secrets);
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactOperationalValue(item, secrets));
    }
    if (!value || typeof value !== "object") {
        return value;
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        result[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactOperationalValue(item, secrets);
    }
    return result;
}