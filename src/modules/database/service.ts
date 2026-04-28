import {
  DATABASE_STATUS,
  type AppendDatabaseMessageInput,
  type DatabaseMessage,
  type DatabaseMessageFilter,
  type DatabaseMessageThread,
  type DatabaseMessageThreadFilter,
  type DatabaseReference,
  type DatabaseReferenceFilter,
  type DatabaseStatusResponse,
  type UpsertDatabaseMessageThreadInput,
  type UpsertDatabaseReferenceInput,
} from "./schema.js";
import {
  DatabaseMessageRepository,
  DatabaseReferenceRepository,
} from "./repository.js";

export class DatabaseService {
  private readonly referenceRepository: DatabaseReferenceRepository;
  private readonly messageRepository: DatabaseMessageRepository;

  constructor(
    referenceRepository?: DatabaseReferenceRepository,
    messageRepository?: DatabaseMessageRepository,
  ) {
    this.referenceRepository =
      referenceRepository ?? new DatabaseReferenceRepository();
    this.messageRepository =
      messageRepository ?? new DatabaseMessageRepository();
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
      references: await this.referenceRepository.list(filter),
    };
  }

  async getReference(id: string): Promise<DatabaseReference | null> {
    return this.referenceRepository.get(id);
  }

  async upsertReference(id: string, data: unknown): Promise<DatabaseReference> {
    return this.referenceRepository.upsert(
      id,
      data as UpsertDatabaseReferenceInput,
    );
  }

  async deleteReference(id: string): Promise<boolean> {
    return this.referenceRepository.delete(id);
  }

  async listMessageThreads(
    filter?: DatabaseMessageThreadFilter,
  ): Promise<{ threads: DatabaseMessageThread[] }> {
    return {
      threads: await this.messageRepository.listThreads(filter),
    };
  }

  async getMessageThread(id: string): Promise<DatabaseMessageThread | null> {
    return this.messageRepository.getThread(id);
  }

  async deleteMessageThread(id: string): Promise<boolean> {
    return this.messageRepository.deleteThread(id);
  }

  async upsertMessageThread(
    id: string,
    data: unknown,
  ): Promise<DatabaseMessageThread> {
    return this.messageRepository.upsertThread(
      id,
      data as UpsertDatabaseMessageThreadInput,
    );
  }

  async listMessages(
    filter?: DatabaseMessageFilter,
  ): Promise<{ messages: DatabaseMessage[] }> {
    return {
      messages: await this.messageRepository.listMessages(filter),
    };
  }

  async appendMessage(data: unknown): Promise<DatabaseMessage> {
    return this.messageRepository.appendMessage(
      data as AppendDatabaseMessageInput,
    );
  }
}
