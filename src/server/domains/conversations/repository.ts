import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { getStoragePaths } from "../../../storage/paths.js";
import { resolveSafeJsonEntityPath } from "../../../utils/path.js";
import { DatabaseReferenceRepository } from "../../../modules/database/repository.js";
import type {
  ConversationSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  MessageSchema,
} from "./schemas.js";

const CONVERSATIONS_DIR = join(getStoragePaths().data, "conversations");

function ensureDir(): void {
  if (!existsSync(CONVERSATIONS_DIR)) {
    mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  }
}

function getConversationPath(id: string): string {
  return resolveSafeJsonEntityPath(CONVERSATIONS_DIR, id, "conversation id");
}

function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function serializeDate(date: Date): string {
  return date.toISOString();
}

function parseStoredConversation(data: unknown): ConversationSchema {
  const obj = data as Record<string, unknown>;
  return {
    id: obj.id as string,
    title: obj.title as string,
    createdAt:
      typeof obj.createdAt === "string"
        ? obj.createdAt
        : serializeDate(new Date()),
    updatedAt:
      typeof obj.updatedAt === "string"
        ? obj.updatedAt
        : serializeDate(new Date()),
    messages: (obj.messages as unknown[])?.map(parseStoredMessage) ?? [],
    metadata: obj.metadata as ConversationSchema["metadata"],
  } as ConversationSchema;
}

function toConversationSummary(
  conversation: ConversationSchema,
): ConversationSchema {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: [],
    turns: [],
    metadata: conversation.metadata,
  };
}

function parseStoredMessage(msg: unknown): MessageSchema {
  const obj = msg as Record<string, unknown>;
  return {
    id: obj.id as string,
    role: obj.role as "user" | "assistant" | "system" | "tool",
    content: obj.content as string,
    createdAt:
      typeof obj.createdAt === "string"
        ? obj.createdAt
        : serializeDate(new Date()),
    toolCalls: obj.toolCalls as MessageSchema["toolCalls"],
    metadata: obj.metadata as MessageSchema["metadata"],
  } as MessageSchema;
}

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MessageSchema[];
  metadata?: Record<string, unknown>;
}

export class ConversationRepository {
  private readonly databaseReferenceRepository: DatabaseReferenceRepository;

  constructor(databaseReferenceRepository?: DatabaseReferenceRepository) {
    this.databaseReferenceRepository =
      databaseReferenceRepository ?? new DatabaseReferenceRepository();
  }

  private ensureDirectory(): void {
    ensureDir();
  }

  private async hydrateConversationReference(
    conversation: ConversationSchema,
  ): Promise<ConversationSchema> {
    const ownerUserId = conversation.metadata?.ownerUserId;
    if (!ownerUserId) {
      return conversation;
    }

    const reference =
      await this.databaseReferenceRepository.getConversationReference(
        ownerUserId,
        conversation.id,
      );
    if (!reference) {
      return conversation;
    }

    return {
      ...conversation,
      metadata: {
        ...(conversation.metadata ?? {}),
        referenceId: reference.id,
        referenceInfo: reference.content,
      } as ConversationSchema["metadata"],
    };
  }

  private async persistConversationReference(
    conversation: ConversationSchema,
  ): Promise<void> {
    const ownerUserId = conversation.metadata?.ownerUserId;
    if (!ownerUserId) {
      return;
    }

    const latestMessage = conversation.messages.at(-1);
    await this.databaseReferenceRepository.upsertConversationReference(
      ownerUserId,
      conversation.id,
      {
              conversationId: conversation.id,
              title: conversation.title,
              messageCount: conversation.messages.length,
              lastMessageAt: latestMessage?.createdAt ?? conversation.updatedAt,
              lastMessageRole: latestMessage?.role,
              lastMessagePreview: latestMessage?.content.slice(0, 240) ?? "",
              agentId: conversation.metadata?.agentId,
              providerId: conversation.metadata?.providerId,
              modelId: conversation.metadata?.modelId,
              tags: conversation.metadata?.tags ?? [],
              updatedAt: conversation.updatedAt,
            },
    );
  }

  async list(options?: {
    limit?: number;
    offset?: number;
    agentId?: string;
  }): Promise<ConversationSchema[]> {
    this.ensureDirectory();
    const files = readdirSync(CONVERSATIONS_DIR).filter((f) =>
      f.endsWith(".json"),
    );

    const conversations: ConversationSchema[] = [];
    for (const file of files) {
      const filePath = join(CONVERSATIONS_DIR, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        const conv = parseStoredConversation(data);

        if (options?.agentId && conv.metadata?.agentId !== options.agentId) {
          continue;
        }

        conversations.push(toConversationSummary(conv));
      } catch {
        continue;
      }
    }

    conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    const page = conversations.slice(offset, offset + limit);
    return Promise.all(
      page.map((conversation) =>
        this.hydrateConversationReference(conversation),
      ),
    );
  }

  async get(id: string): Promise<ConversationSchema | null> {
    this.ensureDirectory();
    const filePath = getConversationPath(id);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const conversation = parseStoredConversation(JSON.parse(content));
      return this.hydrateConversationReference(conversation);
    } catch {
      return null;
    }
  }

  async create(data: CreateConversationSchema): Promise<ConversationSchema> {
    this.ensureDirectory();
    const id = generateId();
    const now = new Date().toISOString();

    const conversation: ConversationRecord = {
      id,
      title: data.title ?? "New Conversation",
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: data.metadata ?? {},
    };

    const filePath = getConversationPath(id);
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), "utf-8");

    const parsed = parseStoredConversation(conversation);
    await this.persistConversationReference(parsed);
    return this.hydrateConversationReference(parsed);
  }

  async update(
    id: string,
    data: UpdateConversationSchema,
  ): Promise<ConversationSchema | null> {
    this.ensureDirectory();
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const updated: ConversationRecord = {
      id: existing.id,
      title: data.title ?? existing.title,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      messages: existing.messages,
      metadata:
        data.metadata !== undefined
          ? { ...existing.metadata, ...data.metadata }
          : existing.metadata,
    };

    const filePath = getConversationPath(id);
    writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");

    const parsed = parseStoredConversation(updated);
    await this.persistConversationReference(parsed);
    return this.hydrateConversationReference(parsed);
  }

  async delete(id: string): Promise<boolean> {
    this.ensureDirectory();
    const filePath = getConversationPath(id);

    if (!existsSync(filePath)) {
      return false;
    }

    const ownerUserId = existingSyncConversationOwner(id);
    unlinkSync(filePath);
    if (ownerUserId) {
      await this.databaseReferenceRepository.delete(
        `conversation-reference:${ownerUserId}:${id}`,
      );
    }
    return true;
  }

  async addMessage(
    conversationId: string,
    message: MessageSchema,
  ): Promise<ConversationSchema | null> {
    this.ensureDirectory();
    const existing = await this.get(conversationId);
    if (!existing) {
      return null;
    }

    const updated: ConversationRecord = {
      id: existing.id,
      title: existing.title,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      messages: [...existing.messages, message],
      metadata: existing.metadata,
    };

    const filePath = getConversationPath(conversationId);
    writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");

    const parsed = parseStoredConversation(updated);
    await this.persistConversationReference(parsed);
    return this.hydrateConversationReference(parsed);
  }

  async listMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number; role?: string },
  ): Promise<MessageSchema[] | null> {
    const conversation = await this.get(conversationId);
    if (!conversation) {
      return null;
    }

    let messages = conversation.messages ?? [];

    if (options?.role) {
      messages = messages.filter((m) => m.role === options.role);
    }

    messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return messages.slice(offset, offset + limit);
  }

  async getMessageById(
    conversationId: string,
    messageId: string,
  ): Promise<MessageSchema | null> {
    const conversation = await this.get(conversationId);
    if (!conversation) return null;
    return conversation.messages.find((m) => m.id === messageId) ?? null;
  }

  async updateMessage(
    conversationId: string,
    messageId: string,
    updatedMessage: MessageSchema,
  ): Promise<boolean> {
    const conversation = await this.get(conversationId);
    if (!conversation) {
      return false;
    }

    const msgIndex = conversation.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) {
      return false;
    }

    const filePath = getConversationPath(conversationId);
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as ConversationRecord;
    data.messages[msgIndex] = updatedMessage;
    data.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    await this.persistConversationReference(parseStoredConversation(data));
    return true;
  }

  generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

function existingSyncConversationOwner(id: string): string | null {
  const filePath = getConversationPath(id);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const conversation = parseStoredConversation(JSON.parse(content));
    return conversation.metadata?.ownerUserId ?? null;
  } catch {
    return null;
  }
}

let repositoryInstance: ConversationRepository | null = null;

export function getConversationRepository(): ConversationRepository {
  if (!repositoryInstance) {
    repositoryInstance = new ConversationRepository();
  }
  return repositoryInstance;
}
