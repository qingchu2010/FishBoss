import path from "node:path";
import { getStoragePaths } from "../../storage/index.js";
import { MySQLiteTable } from "./mysqlite.js";
import {
  AppendDatabaseMessageSchema,
  DatabaseMessageFilterSchema,
  DatabaseMessageSchema,
  DatabaseMessageThreadFilterSchema,
  DatabaseMessageThreadSchema,
  DatabaseReferenceFilterSchema,
  DatabaseReferenceSchema,
  UpsertDatabaseMessageThreadSchema,
  UpsertDatabaseReferenceSchema,
  type AppendDatabaseMessageInput,
  type DatabaseConversationClass,
  type DatabaseMessage,
  type DatabaseMessageFilter,
  type DatabaseMessageThread,
  type DatabaseMessageThreadFilter,
  type DatabaseReference,
  type DatabaseReferenceFilter,
  type UpsertDatabaseMessageThreadInput,
  type UpsertDatabaseReferenceInput,
} from "./schema.js";

const DATABASE_FILENAME = "references.mysqlite.json";
const MESSAGE_THREADS_FILENAME = "message-threads.mysqlite.json";
const MESSAGES_FILENAME = "messages.mysqlite.json";

function generateDatabaseMessageId(): string {
  return `dbmsg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function toStableIdPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 160);
}

export class DatabaseReferenceRepository {
  private readonly table: MySQLiteTable<DatabaseReference>;

  constructor(filePath?: string) {
    const resolvedPath =
      filePath ?? path.join(getStoragePaths().database, DATABASE_FILENAME);
    this.table = new MySQLiteTable<DatabaseReference>(resolvedPath);
  }

  async list(filter?: DatabaseReferenceFilter): Promise<DatabaseReference[]> {
    const parsedFilter = DatabaseReferenceFilterSchema.parse(filter ?? {});
    const rows = await this.table.list((row) => {
      if (parsedFilter.namespace && row.namespace !== parsedFilter.namespace) {
        return false;
      }
      if (
        parsedFilter.ownerUserId &&
        row.ownerUserId !== parsedFilter.ownerUserId
      ) {
        return false;
      }
      if (
        parsedFilter.conversationId &&
        row.conversationId !== parsedFilter.conversationId
      ) {
        return false;
      }
      return true;
    });

    return rows
      .map((row) => DatabaseReferenceSchema.parse(row))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )
      .slice(parsedFilter.offset, parsedFilter.offset + parsedFilter.limit);
  }

  async get(id: string): Promise<DatabaseReference | null> {
    const row = await this.table.get(id);
    return row ? DatabaseReferenceSchema.parse(row) : null;
  }

  async upsert(
    id: string,
    input: UpsertDatabaseReferenceInput,
  ): Promise<DatabaseReference> {
    const parsed = UpsertDatabaseReferenceSchema.parse(input);
    const existing = await this.get(id);
    const timestamp = new Date().toISOString();
    const row: DatabaseReference = DatabaseReferenceSchema.parse({
      id,
      namespace: parsed.namespace,
      ownerUserId: parsed.ownerUserId,
      conversationId: parsed.conversationId,
      title: parsed.title,
      content: parsed.content,
      tags: parsed.tags,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    return this.table.upsert(row);
  }

  async delete(id: string): Promise<boolean> {
    return this.table.delete(id);
  }

  async getConversationReference(
    ownerUserId: string,
    conversationId: string,
  ): Promise<DatabaseReference | null> {
    const rows = await this.list({
      ownerUserId,
      conversationId,
      namespace: "conversation-reference",
      limit: 1,
      offset: 0,
    });
    return rows[0] ?? null;
  }

  async upsertConversationReference(
    ownerUserId: string,
    conversationId: string,
    content: Record<string, unknown>,
  ): Promise<DatabaseReference> {
    return this.upsert(`conversation-reference:${ownerUserId}:${conversationId}`, {
      namespace: "conversation-reference",
      ownerUserId,
      conversationId,
      title: `Conversation reference ${conversationId}`,
      content,
      tags: ["conversation", "reference"],
    });
  }
}

export class DatabaseMessageRepository {
  private readonly threadTable: MySQLiteTable<DatabaseMessageThread>;
  private readonly messageTable: MySQLiteTable<DatabaseMessage>;

  constructor(paths?: { threadsPath?: string; messagesPath?: string }) {
    const storage = getStoragePaths();
    this.threadTable = new MySQLiteTable<DatabaseMessageThread>(
      paths?.threadsPath ??
        path.join(storage.database, MESSAGE_THREADS_FILENAME),
    );
    this.messageTable = new MySQLiteTable<DatabaseMessage>(
      paths?.messagesPath ?? path.join(storage.database, MESSAGES_FILENAME),
    );
  }

  createThreadId(input: {
    conversationClass: DatabaseConversationClass;
    platformId?: string;
    ownerUserId: string;
    targetId: string;
  }): string {
    return [
      "message-thread",
      input.conversationClass,
      input.platformId ? toStableIdPart(input.platformId) : "local",
      toStableIdPart(input.ownerUserId),
      toStableIdPart(input.targetId),
    ].join(":");
  }

  async listThreads(
    filter?: DatabaseMessageThreadFilter,
  ): Promise<DatabaseMessageThread[]> {
    const parsedFilter = DatabaseMessageThreadFilterSchema.parse(filter ?? {});
    const rows = await this.threadTable.list((row) => {
      if (
        parsedFilter.conversationClass &&
        row.conversationClass !== parsedFilter.conversationClass
      ) {
        return false;
      }
      if (
        parsedFilter.ownerUserId &&
        row.ownerUserId !== parsedFilter.ownerUserId
      ) {
        return false;
      }
      if (parsedFilter.targetId && row.targetId !== parsedFilter.targetId) {
        return false;
      }
      if (
        parsedFilter.platformId &&
        row.platformId !== parsedFilter.platformId
      ) {
        return false;
      }
      return true;
    });

    return rows
      .map((row) => DatabaseMessageThreadSchema.parse(row))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )
      .slice(parsedFilter.offset, parsedFilter.offset + parsedFilter.limit);
  }

  async getThread(id: string): Promise<DatabaseMessageThread | null> {
    const row = await this.threadTable.get(id);
    return row ? DatabaseMessageThreadSchema.parse(row) : null;
  }

  async deleteThread(id: string): Promise<boolean> {
    const deleted = await this.threadTable.delete(id);
    if (!deleted) {
      return false;
    }

    const messages = await this.listMessages({
      threadId: id,
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
    await Promise.all(
      messages.map((message) => this.messageTable.delete(message.id)),
    );
    return true;
  }

  async upsertThread(
    id: string,
    input: UpsertDatabaseMessageThreadInput,
  ): Promise<DatabaseMessageThread> {
    const parsed = UpsertDatabaseMessageThreadSchema.parse(input);
    const existing = await this.getThread(id);
    const timestamp = new Date().toISOString();
    const row: DatabaseMessageThread = DatabaseMessageThreadSchema.parse({
      id,
      conversationClass: parsed.conversationClass,
      ownerUserId: parsed.ownerUserId,
      targetId: parsed.targetId,
      platformId: parsed.platformId,
      platformType: parsed.platformType,
      title: parsed.title,
      tags: parsed.tags,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    return this.threadTable.upsert(row);
  }

  async upsertExternalThread(input: {
    conversationClass: DatabaseConversationClass;
    ownerUserId: string;
    targetId: string;
    title: string;
    platformId?: string;
    platformType?: string;
    tags?: string[];
  }): Promise<DatabaseMessageThread> {
    const id = this.createThreadId(input);
    return this.upsertThread(id, {
      ...input,
      tags: input.tags ?? [],
    });
  }

  async listMessages(
    filter?: DatabaseMessageFilter,
  ): Promise<DatabaseMessage[]> {
    const parsedFilter = DatabaseMessageFilterSchema.parse(filter ?? {});
    const rows = await this.messageTable.list((row) => {
      if (parsedFilter.threadId && row.threadId !== parsedFilter.threadId) {
        return false;
      }
      if (
        parsedFilter.conversationClass &&
        row.conversationClass !== parsedFilter.conversationClass
      ) {
        return false;
      }
      if (parsedFilter.direction && row.direction !== parsedFilter.direction) {
        return false;
      }
      if (parsedFilter.senderType && row.senderType !== parsedFilter.senderType) {
        return false;
      }
      return true;
    });

    return rows
      .map((row) => DatabaseMessageSchema.parse(row))
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      )
      .slice(parsedFilter.offset, parsedFilter.offset + parsedFilter.limit);
  }

  async appendMessage(
    input: AppendDatabaseMessageInput,
  ): Promise<DatabaseMessage> {
    const parsed = AppendDatabaseMessageSchema.parse(input);
    const row: DatabaseMessage = DatabaseMessageSchema.parse({
      id: generateDatabaseMessageId(),
      threadId: parsed.threadId,
      conversationClass: parsed.conversationClass,
      direction: parsed.direction,
      senderType: parsed.senderType,
      senderId: parsed.senderId,
      externalMessageId: parsed.externalMessageId,
      content: parsed.content,
      payload: parsed.payload,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    });
    return this.messageTable.upsert(row);
  }
}
