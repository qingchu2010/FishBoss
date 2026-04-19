import type { GroupResponse } from './schema.js';
import { GroupService } from './service.js';

export interface GroupRoutes {
  list(): Promise<GroupResponse>;
  get(id: string): Promise<GroupResponse>;
  create(data: unknown): Promise<GroupResponse>;
  update(id: string, data: unknown): Promise<GroupResponse>;
  delete(id: string): Promise<GroupResponse>;
  addMember(groupId: string, userId: string): Promise<GroupResponse>;
  removeMember(groupId: string, userId: string): Promise<GroupResponse>;
  getStatus(): Promise<GroupResponse>;
}

export function createGroupRoutes(service?: GroupService): GroupRoutes {
  const svc = service ?? new GroupService();

  return {
    list: () => svc.list(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    addMember: (groupId, userId) => svc.addMember(groupId, userId),
    removeMember: (groupId, userId) => svc.removeMember(groupId, userId),
    getStatus: () => svc.getStatus(),
  };
}
