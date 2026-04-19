import path from "node:path";
import { getStoragePaths } from "../../storage/index.js";
import { MySQLiteTable } from "./mysqlite.js";
import {
  DatabaseReferenceFilterSchema,
  DatabaseReferenceSchema,
  UpsertDatabaseReferenceSchema,
  type DatabaseReference,
  type DatabaseReferenceFilter,
  type UpsertDatabaseReferenceInput,
} from "./schema.js";

const DATABASE_FILENAME = "references.mysqlite.json";

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
