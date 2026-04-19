import type {
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
  };
}
