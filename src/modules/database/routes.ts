import type {
  DatabaseMessage,
  DatabaseMessageFilter,
  DatabaseMessageThread,
  DatabaseMessageThreadFilter,
  DatabaseReference,
  DatabaseReferenceFilter,
  DatabaseStatusResponse,
} from "./schema.js";
import { DatabaseService } from "./service.js";

export interface DatabaseRoutes {
  getStatus(): Promise<DatabaseStatusResponse>;
  listReferences(
    filter?: DatabaseReferenceFilter,
  ): Promise<{ references: DatabaseReference[] }>;
  getReference(id: string): Promise<DatabaseReference | null>;
  upsertReference(id: string, data: unknown): Promise<DatabaseReference>;
  deleteReference(id: string): Promise<boolean>;
  listMessageThreads(
    filter?: DatabaseMessageThreadFilter,
  ): Promise<{ threads: DatabaseMessageThread[] }>;
  getMessageThread(id: string): Promise<DatabaseMessageThread | null>;
  deleteMessageThread(id: string): Promise<boolean>;
  upsertMessageThread(
    id: string,
    data: unknown,
  ): Promise<DatabaseMessageThread>;
  listMessages(
    filter?: DatabaseMessageFilter,
  ): Promise<{ messages: DatabaseMessage[] }>;
  appendMessage(data: unknown): Promise<DatabaseMessage>;
}

export function createDatabaseRoutes(
  service?: DatabaseService,
): DatabaseRoutes {
  const svc = service ?? new DatabaseService();

  return {
    getStatus: () => svc.getStatus(),
    listReferences: (filter) => svc.listReferences(filter),
    getReference: (id) => svc.getReference(id),
    upsertReference: (id, data) => svc.upsertReference(id, data),
    deleteReference: (id) => svc.deleteReference(id),
    listMessageThreads: (filter) => svc.listMessageThreads(filter),
    getMessageThread: (id) => svc.getMessageThread(id),
    deleteMessageThread: (id) => svc.deleteMessageThread(id),
    upsertMessageThread: (id, data) => svc.upsertMessageThread(id, data),
    listMessages: (filter) => svc.listMessages(filter),
    appendMessage: (data) => svc.appendMessage(data),
  };
}
