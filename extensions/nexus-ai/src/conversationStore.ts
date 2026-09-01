import { ModelSelection, ReadOnlyMode } from "./readOnlyChatRuntime";

const STORAGE_KEY = "nexusAI.conversation.v1";

export interface ConversationStorage {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

export interface ConversationTurn {
    prompt: string;
    response: string;
    mode: ReadOnlyMode;
    harness: string;
    model: ModelSelection;
    route: string;
}

export class ConversationStore {
    public constructor(
        private readonly storage: ConversationStorage,
        private readonly maximumTurns = 40,
    ) {}

    public load(): readonly ConversationTurn[] {
        const value = this.storage.get<unknown>(STORAGE_KEY, []);
        return Array.isArray(value) ? value.filter(isConversationTurn).slice(-this.maximumTurns) : [];
    }

    public async append(turn: ConversationTurn): Promise<void> {
        await this.storage.update(STORAGE_KEY, [...this.load(), turn].slice(-this.maximumTurns));
    }
}

function isConversationTurn(value: unknown): value is ConversationTurn {
    if (!value || typeof value !== "object") {
        return false;
    }
    const turn = value as Partial<ConversationTurn>;
    return typeof turn.prompt === "string"
        && typeof turn.response === "string"
        && (turn.mode === "ask" || turn.mode === "design")
        && typeof turn.harness === "string"
        && (turn.model === "auto" || turn.model === "ollama")
        && typeof turn.route === "string";
}