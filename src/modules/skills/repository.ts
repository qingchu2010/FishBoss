import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import type { Skill, SkillCommand } from '../../types/skill.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';

interface StoredSkill {
  id: string;
  name: string;
  description: string;
  commands: SkillCommand[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class SkillRepository {
  private skillsPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { skills: customPath } : getStoragePaths();
    this.skillsPath = paths.skills;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.skillsPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.skillsPath, id, 'skill id');
  }

  async list(): Promise<Skill[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.skillsPath);
    const skills: Skill[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.skillsPath, file), 'utf-8');
        const data = JSON.parse(content) as StoredSkill;
        skills.push(this.deserializeSkill(data));
      } catch {
        // Skip invalid files
      }
    }

    return skills.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async get(id: string): Promise<Skill | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.deserializeSkill(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: {
    name: string;
    description: string;
    commands: SkillCommand[];
    enabled: boolean;
  }): Promise<Skill> {
    await this.ensureDir();
    const now = new Date();
    const skill: Skill = {
      id: generateId(),
      name: data.name,
      description: data.description,
      commands: data.commands,
      enabled: data.enabled,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      this.getFilePath(skill.id),
      JSON.stringify(this.serializeSkill(skill), null, 2)
    );

    return skill;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      commands: SkillCommand[];
      enabled: boolean;
    }>
  ): Promise<Skill | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: Skill = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      commands: data.commands ?? existing.commands,
      enabled: data.enabled ?? existing.enabled,
      updatedAt: new Date(),
    };

    await fs.writeFile(
      this.getFilePath(id),
      JSON.stringify(this.serializeSkill(updated), null, 2)
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private serializeSkill(skill: Skill): StoredSkill {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      commands: skill.commands,
      enabled: skill.enabled,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    };
  }

  private deserializeSkill(data: StoredSkill): Skill {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      commands: data.commands,
      enabled: data.enabled,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    } as Skill;
  }
}
