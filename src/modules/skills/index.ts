import type { Skill } from '../../types/skill.js';

export interface SkillStore {
  list(): Promise<Skill[]>;
  get(id: string): Promise<Skill | null>;
  create(data: Partial<Skill>): Promise<Skill>;
  update(id: string, data: Partial<Skill>): Promise<Skill>;
  delete(id: string): Promise<void>;
}

export interface SkillExecutor {
  execute(skillId: string, command: string, args: Record<string, unknown>): Promise<unknown>;
  listCommands(skillId: string): string[];
}

export { SkillService } from './service.js';
export { createSkillRoutes, type SkillRoutes } from './routes.js';
export { SkillRepository } from './repository.js';
export * from './schema.js';
