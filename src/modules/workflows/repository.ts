import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import type { Workflow } from '../../types/workflow.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';

export class WorkflowRepository {
  private workflowsPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { workflows: customPath } : getStoragePaths();
    this.workflowsPath = paths.workflows;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.workflowsPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.workflowsPath, id, 'workflow id');
  }

  async list(): Promise<Workflow[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.workflowsPath);
    const workflows: Workflow[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.workflowsPath, file), 'utf-8');
        const data = JSON.parse(content);
        workflows.push(this.deserializeWorkflow(data));
      } catch {
        // Skip invalid files
      }
    }

    return workflows.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async get(id: string): Promise<Workflow | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.deserializeWorkflow(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: Partial<Workflow> & { name: string }): Promise<Workflow> {
    await this.ensureDir();
    const now = new Date();
    const workflow: Workflow = {
      id: generateId(),
      name: data.name,
      description: data.description ?? '',
      steps: data.steps ?? [],
      enabled: data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await fs.writeFile(
      this.getFilePath(workflow.id),
      JSON.stringify(this.serializeWorkflow(workflow), null, 2)
    );

    return workflow;
  }

  async update(id: string, data: Partial<Workflow>): Promise<Workflow | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: Workflow = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    await fs.writeFile(
      this.getFilePath(id),
      JSON.stringify(this.serializeWorkflow(updated), null, 2)
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

  private serializeWorkflow(workflow: Workflow): Record<string, unknown> {
    return {
      ...workflow,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  }

  private deserializeWorkflow(data: Record<string, unknown>): Workflow {
    return {
      ...data,
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
    } as Workflow;
  }
}
