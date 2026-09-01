export type NexusErrorCode =
    | "aborted"
    | "authentication"
    | "rate-limited"
    | "timeout"
    | "unavailable"
    | "invalid-response"
    | "policy"
    | "no-routes"
    | "fallback-exhausted"
    | "unknown";

export interface NexusErrorOptions {
    code: NexusErrorCode;
    message: string;
    providerId?: string;
    status?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    safeDetails?: string;
    cause?: unknown;
}

export class NexusError extends Error {
    public readonly code: NexusErrorCode;
    public readonly providerId?: string;
    public readonly status?: number;
    public readonly retryable: boolean;
    public readonly retryAfterMs?: number;
    public readonly safeDetails?: string;

    public constructor(options: NexusErrorOptions) {
        super(options.message, { cause: options.cause });
        this.name = "NexusError";
        this.code = options.code;
        this.providerId = options.providerId;
        this.status = options.status;
        this.retryable = options.retryable ?? false;
        this.retryAfterMs = options.retryAfterMs;
        this.safeDetails = options.safeDetails;
    }
}

export async function errorFromResponse(response: Response, providerId: string): Promise<NexusError> {
    const status = response.status;
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));

    if (status === 401 || status === 403) {
        return new NexusError({ code: "authentication", message: `${providerId} rejected its credentials.`, providerId, status });
    }
    if (status === 429) {
        return new NexusError({ code: "rate-limited", message: `${providerId} is rate limited.`, providerId, status, retryable: true, retryAfterMs });
    }
    if ([408, 409, 425].includes(status) || status >= 500) {
        return new NexusError({ code: status === 408 ? "timeout" : "unavailable", message: `${providerId} is temporarily unavailable.`, providerId, status, retryable: true, retryAfterMs });
    }
    return new NexusError({ code: "invalid-response", message: `${providerId} returned HTTP ${status}.`, providerId, status });
}

export function normalizeError(error: unknown, providerId?: string): NexusError {
    if (error instanceof NexusError) {
        return error;
    }
    if (isAbortError(error)) {
        return new NexusError({ code: "aborted", message: "The request was cancelled.", providerId, cause: error });
    }
    if (error instanceof TypeError) {
        return new NexusError({ code: "unavailable", message: providerId ? `${providerId} could not be reached.` : "The provider could not be reached.", providerId, retryable: true, cause: error });
    }
    return new NexusError({ code: "unknown", message: "The provider request failed.", providerId, cause: error });
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError"
        || error instanceof Error && error.name === "AbortError";
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) {
        return undefined;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1_000;
    }
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}