import { NexusError, normalizeError } from "./errors";

export async function* jsonLines<T>(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): AsyncGenerator<T> {
    for await (const line of lines(body, signal)) {
        if (!line.trim()) {
            continue;
        }
        yield parseJson<T>(line);
    }
}

export async function* sseJson<T>(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): AsyncGenerator<T> {
    let data: string[] = [];
    for await (const line of lines(body, signal)) {
        if (line === "") {
            if (data.length > 0) {
                const payload = data.join("\n");
                data = [];
                if (payload === "[DONE]") {
                    return;
                }
                yield parseJson<T>(payload);
            }
            continue;
        }
        if (line.startsWith("data:")) {
            data.push(line.slice(5).trimStart());
        }
    }
    if (data.length > 0) {
        const payload = data.join("\n");
        if (payload !== "[DONE]") {
            yield parseJson<T>(payload);
        }
    }
}

async function* lines(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): AsyncGenerator<string> {
    if (!body) {
        throw new NexusError({ code: "invalid-response", message: "The provider returned an empty response body." });
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const abort = () => { void reader.cancel(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });

    try {
        while (true) {
            if (signal.aborted) {
                throw signal.reason ?? new DOMException("Aborted", "AbortError");
            }
            const chunk = await reader.read();
            if (signal.aborted) {
                throw signal.reason ?? new DOMException("Aborted", "AbortError");
            }
            if (chunk.done) {
                break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() ?? "";
            yield* parts;
        }
        buffer += decoder.decode();
        if (buffer) {
            yield buffer;
        }
    } catch (error) {
        throw normalizeError(error);
    } finally {
        signal.removeEventListener("abort", abort);
        reader.releaseLock();
    }
}

function parseJson<T>(value: string): T {
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        throw new NexusError({ code: "invalid-response", message: "The provider returned malformed streaming JSON.", cause: error });
    }
}