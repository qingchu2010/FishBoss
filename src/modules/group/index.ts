export * as groupSchema from './schema.js';
export * as groupService from './service.js';
export * as groupRoutes from './routes.js';

export { GroupService } from './service.js';
export { createGroupRoutes, type GroupRoutes } from './routes.js';

export interface Group {
  id: string;
  name: string;
  description?: string;
  members: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupStore {
  list(): Promise<Group[]>;
  get(id: string): Promise<Group | null>;
  create(data: Partial<Group>): Promise<Group>;
  update(id: string, data: Partial<Group>): Promise<Group>;
  delete(id: string): Promise<void>;
  addMember(groupId: string, userId: string): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
}
