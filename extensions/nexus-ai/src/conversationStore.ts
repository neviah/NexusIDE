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

export interface ConversationSummary {
    id: string;
    title: string;
}

interface StoredConversation extends ConversationSummary {
    turns: ConversationTurn[];
}

interface ConversationDocument {
    activeId: string;
    conversations: StoredConversation[];
}

export class ConversationStore {
    public constructor(
        private readonly storage: ConversationStorage,
        private readonly maximumTurns = 40,
        private readonly maximumConversations = 20,
    ) {}

    public load(): readonly ConversationTurn[] {
        const document = this.read();
        return document.conversations.find(({ id }) => id === document.activeId)?.turns ?? [];
    }

    public list(): readonly ConversationSummary[] {
        return this.read().conversations.map(({ id, title }) => ({ id, title }));
    }

    public activeId(): string {
        return this.read().activeId;
    }

    public async append(turn: ConversationTurn): Promise<void> {
        const document = this.read();
        const conversation = this.active(document);
        conversation.turns = [...conversation.turns, turn].slice(-this.maximumTurns);
        if (conversation.title === "New conversation") {
            conversation.title = titleFrom(turn.prompt);
        }
        await this.save(document);
    }

    public async replaceLast(turn: ConversationTurn): Promise<void> {
        const document = this.read();
        const conversation = this.active(document);
        conversation.turns = [...conversation.turns.slice(0, -1), turn].slice(-this.maximumTurns);
        await this.save(document);
    }

    public async clear(): Promise<void> {
        const document = this.read();
        this.active(document).turns = [];
        await this.save(document);
    }

    public async create(): Promise<string> {
        const document = this.read();
        const conversation = emptyConversation();
        document.activeId = conversation.id;
        document.conversations = [conversation, ...document.conversations].slice(0, this.maximumConversations);
        await this.save(document);
        return conversation.id;
    }

    public async select(id: string): Promise<boolean> {
        const document = this.read();
        if (!document.conversations.some((conversation) => conversation.id === id)) {
            return false;
        }
        document.activeId = id;
        await this.save(document);
        return true;
    }

    private read(): ConversationDocument {
        const value = this.storage.get<unknown>(STORAGE_KEY, []);
        if (Array.isArray(value)) {
            const conversation = emptyConversation("legacy");
            conversation.turns = value.filter(isConversationTurn).slice(-this.maximumTurns);
            conversation.title = conversation.turns.length ? titleFrom(conversation.turns[0].prompt) : conversation.title;
            return { activeId: conversation.id, conversations: [conversation] };
        }
        if (!isConversationDocument(value)) {
            const conversation = emptyConversation();
            return { activeId: conversation.id, conversations: [conversation] };
        }
        const conversations = value.conversations.slice(0, this.maximumConversations).map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            turns: conversation.turns.filter(isConversationTurn).slice(-this.maximumTurns),
        }));
        const activeId = conversations.some(({ id }) => id === value.activeId) ? value.activeId : conversations[0].id;
        return { activeId, conversations };
    }

    private active(document: ConversationDocument): StoredConversation {
        return document.conversations.find(({ id }) => id === document.activeId) ?? document.conversations[0];
    }

    private async save(document: ConversationDocument): Promise<void> {
        await this.storage.update(STORAGE_KEY, document);
    }
}

function emptyConversation(id = `${Date.now()}-${Math.random().toString(36).slice(2)}`): StoredConversation {
    return { id, title: "New conversation", turns: [] };
}

function titleFrom(prompt: string): string {
    return prompt.trim().replace(/\s+/g, " ").slice(0, 48) || "New conversation";
}

function isConversationDocument(value: unknown): value is ConversationDocument {
    if (!value || typeof value !== "object") return false;
    const document = value as Partial<ConversationDocument>;
    return typeof document.activeId === "string"
        && Array.isArray(document.conversations)
        && document.conversations.length > 0
        && document.conversations.every((conversation) => Boolean(conversation)
            && typeof conversation.id === "string"
            && typeof conversation.title === "string"
            && Array.isArray(conversation.turns));
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
        && (turn.model === "auto" || turn.model === "ollama" || turn.model === "openrouter" || turn.model === "groq")
        && typeof turn.route === "string";
}