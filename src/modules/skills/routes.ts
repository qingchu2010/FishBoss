import type { SkillResponse, ExecuteSkillResponse } from './schema.js';
import { SkillService } from './service.js';

export interface SkillRoutes {
  list(): Promise<SkillResponse[]>;
  get(id: string): Promise<SkillResponse | null>;
  create(data: unknown): Promise<SkillResponse>;
  update(id: string, data: unknown): Promise<SkillResponse | null>;
  delete(id: string): Promise<boolean>;
  importSkill(data: unknown): Promise<{ success: boolean; skill?: SkillResponse; error?: string }>;
  listCommands(skillId: string): Promise<string[]>;
  execute(skillId: string, data: unknown): Promise<ExecuteSkillResponse>;
}

export function createSkillRoutes(service?: SkillService): SkillRoutes {
  const svc = service ?? new SkillService();

  return {
    list: () => svc.list(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    importSkill: (data) => svc.importSkill(data),
    listCommands: (skillId) => svc.listCommands(skillId),
    execute: (skillId, data) => svc.execute(skillId, data),
  };
}
