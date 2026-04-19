import type { SkillCommand } from '../../types/skill.js';
import { SkillRepository } from './repository.js';
import {
  CreateSkillSchema,
  UpdateSkillSchema,
  ImportSkillSchema,
  ExecuteSkillSchema,
  toSkillResponse,
  type SkillResponse,
  type ExecuteSkillResponse,
} from './schema.js';

export class SkillService {
  private repository: SkillRepository;

  constructor(repository?: SkillRepository) {
    this.repository = repository ?? new SkillRepository();
  }

  async list(): Promise<SkillResponse[]> {
    const skills = await this.repository.list();
    return skills.map(toSkillResponse);
  }

  async get(id: string): Promise<SkillResponse | null> {
    const skill = await this.repository.get(id);
    return skill ? toSkillResponse(skill) : null;
  }

  async create(data: unknown): Promise<SkillResponse> {
    const parsed = CreateSkillSchema.parse(data);
    const skill = await this.repository.create({
      name: parsed.name,
      description: parsed.description,
      commands: parsed.commands,
      enabled: parsed.enabled,
    });
    return toSkillResponse(skill);
  }

  async update(id: string, data: unknown): Promise<SkillResponse | null> {
    const parsed = UpdateSkillSchema.parse(data);
    const skill = await this.repository.update(id, {
      name: parsed.name,
      description: parsed.description,
      commands: parsed.commands,
      enabled: parsed.enabled,
    });
    return skill ? toSkillResponse(skill) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async importSkill(data: unknown): Promise<{ success: boolean; skill?: SkillResponse; error?: string }> {
    const parsed = ImportSkillSchema.parse(data);

    try {
      const importedSkill = await this.fetchSkillFromSource(parsed.source);
      const skill = await this.repository.create({
        name: parsed.name ?? importedSkill.name,
        description: importedSkill.description,
        commands: importedSkill.commands,
        enabled: parsed.enabled,
      });
      return { success: true, skill: toSkillResponse(skill) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listCommands(skillId: string): Promise<string[]> {
    const skill = await this.repository.get(skillId);
    if (!skill) return [];
    return skill.commands.map(c => c.name);
  }

  async execute(skillId: string, data: unknown): Promise<ExecuteSkillResponse> {
    const parsed = ExecuteSkillSchema.parse(data);

    try {
      const skill = await this.repository.get(skillId);
      if (!skill) {
        return { success: false, error: 'Skill not found' };
      }

      if (!skill.enabled) {
        return { success: false, error: 'Skill is disabled' };
      }

      const command = skill.commands.find(c => c.name === parsed.command);
      if (!command) {
        return { success: false, error: `Command not found: ${parsed.command}` };
      }

      return {
        success: true,
        result: { placeholder: true },
        output: `[Placeholder] Would execute ${command.handler} with args: ${JSON.stringify(parsed.args)}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async fetchSkillFromSource(source: string): Promise<{
    name: string;
    description: string;
    commands: SkillCommand[];
  }> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return {
        name: `Remote skill from ${source}`,
        description: 'Imported from remote source',
        commands: [{ name: 'run', description: 'Run the skill', handler: 'echo placeholder' }],
      };
    }

    if (source.startsWith('npm:')) {
      const packageName = source.slice(4);
      return {
        name: `NPM skill: ${packageName}`,
        description: `Imported from npm package ${packageName}`,
        commands: [{ name: 'run', description: 'Run the skill', handler: 'echo placeholder' }],
      };
    }

    throw new Error(`Unsupported skill source: ${source}`);
  }
}
