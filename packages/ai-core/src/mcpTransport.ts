import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, MCP_PROTOCOL_VERSION, McpTransport } from "./mcp";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpMcpTransportOptions {
    url: string;
    headers?: Readonly<Record<string, string>>;
    fetch?: FetchLike;
}

/**
 * Streamable HTTP transport. Accepts either a JSON or an SSE response body because
 * compliant servers may answer a single request with either.
 */
export class HttpMcpTransport implements McpTransport {
    private readonly request_: FetchLike;
    private sessionId?: string;
    private resolvedUrl?: string;

    public constructor(private readonly options: HttpMcpTransportOptions) {
        this.request_ = options.fetch ?? ((input, init) => fetch(input, init));
    }

    public endpoint(): string {
        return this.resolvedUrl ?? this.options.url;
    }

    public async request(message: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse> {
        const response = await this.post(message, signal);
        const body = await readBody(response);
        if (body === undefined) {
            throw new Error(`MCP server returned an empty response for ${message.method}.`);
        }
        return body;
    }

    public async notify(message: JsonRpcNotification, signal: AbortSignal): Promise<void> {
        await this.post(message, signal);
    }

    public async close(): Promise<void> {
        this.sessionId = undefined;
    }

    private async post(message: JsonRpcRequest | JsonRpcNotification, signal: AbortSignal): Promise<Response> {
        for (const candidate of this.candidates()) {
            const response = await this.request_(candidate, {
                method: "POST",
                signal,
                headers: {
                    ...this.options.headers,
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
                    ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
                },
                body: JSON.stringify(message),
            });
            // Only an unresolved endpoint falls through to the next candidate path.
            if ((response.status === 404 || response.status === 405) && !this.resolvedUrl) {
                continue;
            }
            if (!response.ok) {
                throw new Error(`MCP server responded ${response.status} ${response.statusText}.`);
            }
            this.resolvedUrl = candidate;
            this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
            return response;
        }
        throw new Error(`No MCP endpoint answered at ${this.options.url}. Confirm the URL shown by the server.`);
    }

    private candidates(): readonly string[] {
        if (this.resolvedUrl) {
            return [this.resolvedUrl];
        }
        const base = this.options.url.replace(/\/$/, "");
        return base.endsWith("/mcp") ? [base] : [base, `${base}/mcp`];
    }
}

export interface StdioStreams {
    stdin: { write(chunk: string): unknown };
    stdout: NodeJS.ReadableStream;
}

/** Newline-delimited JSON-RPC over a child process's standard streams. */
export class StdioMcpTransport implements McpTransport {
    private readonly pending = new Map<number, { resolve(value: JsonRpcResponse): void; reject(error: Error): void }>();
    private buffer = "";
    private closed = false;

    public constructor(private readonly streams: StdioStreams, private readonly onClose?: () => void) {
        streams.stdout.on("data", (chunk: Buffer | string) => this.receive(chunk.toString()));
        streams.stdout.on("close", () => this.failAll(new Error("MCP server closed the connection.")));
    }

    public async request(message: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse> {
        if (this.closed) {
            throw new Error("MCP server connection is closed.");
        }
        return await new Promise<JsonRpcResponse>((resolve, reject) => {
            const abort = () => {
                this.pending.delete(message.id);
                reject(new Error(`MCP ${message.method} was cancelled.`));
            };
            if (signal.aborted) {
                abort();
                return;
            }
            signal.addEventListener("abort", abort, { once: true });
            this.pending.set(message.id, {
                resolve: (value) => {
                    signal.removeEventListener("abort", abort);
                    resolve(value);
                },
                reject: (error) => {
                    signal.removeEventListener("abort", abort);
                    reject(error);
                },
            });
            this.streams.stdin.write(`${JSON.stringify(message)}\n`);
        });
    }

    public async notify(message: JsonRpcNotification): Promise<void> {
        if (!this.closed) {
            this.streams.stdin.write(`${JSON.stringify(message)}\n`);
        }
    }

    public async close(): Promise<void> {
        this.closed = true;
        this.failAll(new Error("MCP server connection is closed."));
        this.onClose?.();
    }

    private receive(chunk: string): void {
        this.buffer += chunk;
        let newline = this.buffer.indexOf("\n");
        while (newline >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            newline = this.buffer.indexOf("\n");
            if (!line) {
                continue;
            }
            try {
                const message = JSON.parse(line) as JsonRpcResponse;
                const id = typeof message.id === "number" ? message.id : undefined;
                const pending = id === undefined ? undefined : this.pending.get(id);
                if (pending && id !== undefined) {
                    this.pending.delete(id);
                    pending.resolve(message);
                }
            } catch {
                // Servers may log non-JSON lines to stdout; ignore rather than fail the session.
            }
        }
    }

    private failAll(error: Error): void {
        for (const [id, pending] of this.pending) {
            this.pending.delete(id);
            pending.reject(error);
        }
    }
}

async function readBody(response: Response): Promise<JsonRpcResponse | undefined> {
    const text = (await response.text()).trim();
    if (!text) {
        return undefined;
    }
    if (!text.startsWith("event:") && !text.startsWith("data:")) {
        return JSON.parse(text) as JsonRpcResponse;
    }
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (payload && payload !== "[DONE]") {
                return JSON.parse(payload) as JsonRpcResponse;
            }
        }
    }
    return undefined;
}
