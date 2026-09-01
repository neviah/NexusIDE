export const OPENAI_TEXT_STREAM = [
    "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n",
    "data: [DONE]\n\n",
] as const;

export const OLLAMA_TEXT_STREAM = [
    "{\"message\":{\"content\":\"hello\"},\"done\":false}\n",
    "{\"done\":true,\"done_reason\":\"stop\"}\n",
] as const;

export const MALFORMED_SSE_STREAM = ["data: {bad}\n\n"] as const;

export const THROTTLED_RESPONSE = {
    status: 429,
    body: "rate limited",
    headers: { "retry-after": "2" },
} as const;

export function pendingStream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({ start() {} });
}