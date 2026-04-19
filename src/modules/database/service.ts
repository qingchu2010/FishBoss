import {
  DATABASE_STATUS,
  type DatabaseReference,
  type DatabaseReferenceFilter,
  type DatabaseStatusResponse,
  type UpsertDatabaseReferenceInput,
} from "./schema.js";
import { DatabaseReferenceRepository } from "./repository.js";

export class DatabaseService {
  private readonly repository: DatabaseReferenceRepository;

  constructor(repository?: DatabaseReferenceRepository) {
    this.repository = repository ?? new DatabaseReferenceRepository();
  }

  async getStatus(): Promise<DatabaseStatusResponse> {
    return {
      status: DATABASE_STATUS.READY,
      message: "Database reference layer is available.",
      storage: {
        kind: "mysqlite",
      },
    };
  }

  async listReferences(
    filter?: DatabaseReferenceFilter,
  ): Promise<{ references: DatabaseReference[] }> {
    return {
      references: await this.repository.list(filter),
    };
  }

  async getReference(id: string): Promise<DatabaseReference | null> {
    return this.repository.get(id);
  }

  async upsertReference(id: string, data: unknown): Promise<DatabaseReference> {
    return this.repository.upsert(id, data as UpsertDatabaseReferenceInput);
  }

  async deleteReference(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}
