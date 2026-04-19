import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { getStoragePaths } from '../../../storage/paths.js';
import { resolveSafeJsonEntityPath } from '../../../utils/path.js';
import type { AgentSchema, CreateAgentSchema, UpdateAgentSchema } from './schemas.js';

const AGENTS_DIR = join(getStoragePaths().data, 'agents');

function ensureDir(): void {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

function getAgentPath(id: string): string {
  return resolveSafeJsonEntityPath(AGENTS_DIR, id, 'agent id');
}

function generateId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  toolPermissions?: {
    allowedTools?: string[];
    deniedTools?: string[];
  };
  model?: string;
  provider?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class AgentRepository {
  private ensureDirectory(): void {
    ensureDir();
  }

  async list(options?: { limit?: number; offset?: number }): Promise<AgentSchema[]> {
    this.ensureDirectory();
    const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json'));

    const agents: AgentSchema[] = [];
    for (const file of files) {
      const filePath = join(AGENTS_DIR, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        agents.push(parseStoredAgent(data));
      } catch {
        continue;
      }
    }

    agents.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return agents.slice(offset, offset + limit);
  }

  async get(id: string): Promise<AgentSchema | null> {
    this.ensureDirectory();
    const filePath = getAgentPath(id);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return parseStoredAgent(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: CreateAgentSchema): Promise<AgentSchema> {
    this.ensureDirectory();
    const id = generateId();
    const now = new Date().toISOString();

    const agent: AgentRecord = {
      id,
      name: data.name,
      description: data.description ?? '',
      instructions: data.instructions,
      tools: data.tools ?? [],
      toolPermissions: data.toolPermissions,
      model: data.model,
      provider: data.provider,
      settings: data.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const filePath = getAgentPath(id);
    writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf-8');

    return parseStoredAgent(agent as unknown as Record<string, unknown>);
  }

  async update(id: string, data: UpdateAgentSchema): Promise<AgentSchema | null> {
    this.ensureDirectory();
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const updated: AgentRecord = {
      id: existing.id,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      instructions: data.instructions ?? existing.instructions,
      tools: data.tools ?? existing.tools,
      toolPermissions: data.toolPermissions ?? existing.toolPermissions,
      model: data.model ?? existing.model,
      provider: data.provider ?? existing.provider,
      settings: data.settings ?? existing.settings,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const filePath = getAgentPath(id);
    writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    return parseStoredAgent(updated as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    this.ensureDirectory();
    const filePath = getAgentPath(id);

    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    return true;
  }
}

function parseStoredAgent(data: Record<string, unknown>): AgentSchema {
  return {
    id: data['id'] as string,
    name: data['name'] as string,
    description: (data['description'] as string) ?? '',
    instructions: data['instructions'] as string,
    tools: (data['tools'] as string[]) ?? [],
    toolPermissions: data['toolPermissions'] as AgentSchema['toolPermissions'],
    model: data['model'] as string | undefined,
    provider: data['provider'] as string | undefined,
    settings: data['settings'] as AgentSchema['settings'],
    createdAt: typeof data['createdAt'] === 'string' ? (data['createdAt'] as string) : new Date().toISOString(),
    updatedAt: typeof data['updatedAt'] === 'string' ? (data['updatedAt'] as string) : new Date().toISOString(),
  };
}

let repositoryInstance: AgentRepository | null = null;

export function getAgentRepository(): AgentRepository {
  if (!repositoryInstance) {
    repositoryInstance = new AgentRepository();
  }
  return repositoryInstance;
}
