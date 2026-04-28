import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';
import {
  CreateWorkflowDefinitionInputSchema,
  LegacyWorkflowSchema,
  UpdateWorkflowDefinitionInputSchema,
  WorkflowDefinitionSchema,
  WorkflowRunListQuerySchema,
  WorkflowRunSchema,
  type CreateWorkflowDefinitionInput,
  type LegacyWorkflow,
  type UpdateWorkflowDefinitionInput,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNodeDefinition,
  type WorkflowRun,
  type WorkflowRunListQuery,
} from './schema.js';

type WorkflowRunPatchInput = Partial<WorkflowRun> | ((run: WorkflowRun) => Partial<WorkflowRun>);

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function defaultNodePosition(index: number): { x: number; y: number } {
  return {
    x: 120 + (index % 4) * 260,
    y: 120 + Math.floor(index / 4) * 180,
  };
}

function buildEdgeId(edge: Pick<WorkflowEdge, 'from' | 'to' | 'branch' | 'fromHandle' | 'toHandle'>): string {
  return [
    edge.from,
    edge.fromHandle ?? edge.branch ?? 'default',
    edge.toHandle ?? 'default',
    edge.to,
  ].join('::');
}

function normalizeNode(node: WorkflowNodeDefinition, index: number): WorkflowNodeDefinition {
  return {
    ...node,
    position: node.position ?? defaultNodePosition(index),
  };
}

function normalizeEdge(edge: WorkflowEdge): WorkflowEdge {
  const branch = edge.branch ?? (edge.fromHandle === 'true' || edge.fromHandle === 'false' ? edge.fromHandle : undefined);
  return {
    ...edge,
    branch,
    id: edge.id ?? buildEdgeId({
      from: edge.from,
      to: edge.to,
      branch,
      fromHandle: edge.fromHandle,
      toHandle: edge.toHandle,
    }),
  };
}

function normalizeDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    ...definition,
    nodes: definition.nodes.map((node, index) => normalizeNode(node, index)),
    edges: definition.edges.map((edge) => normalizeEdge(edge)),
  });
}

function normalizeLegacyWorkflow(workflow: LegacyWorkflow): WorkflowDefinition {
  const nodes = workflow.steps
    .filter((step) => step.type !== 'loop')
    .map((step, index) => ({
      id: step.id,
      name: step.name,
      type: step.type,
      config: step.config,
      position: defaultNodePosition(index),
    }));
  const edges = workflow.steps.flatMap((step) =>
    (step.next ?? []).map((nextId) =>
      normalizeEdge({
        from: step.id,
        to: nextId,
      }),
    ),
  );

  return WorkflowDefinitionSchema.parse({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    version: 1,
    enabled: workflow.enabled,
    trigger: {
      type: 'manual',
      config: {},
    },
    nodes,
    edges,
    variables: {},
    createdAt: toIsoString(workflow.createdAt),
    updatedAt: toIsoString(workflow.updatedAt),
  });
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function sortRunsDesc(runs: WorkflowRun[]): WorkflowRun[] {
  return [...runs].sort((left, right) => {
    const rightTime = new Date(right.startedAt ?? right.createdAt).getTime();
    const leftTime = new Date(left.startedAt ?? left.createdAt).getTime();
    return rightTime - leftTime;
  });
}

const pendingFileWrites = new Map<string, Promise<void>>();

async function withFileWriteLock(filePath: string, write: () => Promise<void>): Promise<void> {
  const previous = pendingFileWrites.get(filePath) ?? Promise.resolve();
  const next = previous.then(write, write);
  pendingFileWrites.set(filePath, next);
  try {
    await next;
  } finally {
    if (pendingFileWrites.get(filePath) === next) {
      pendingFileWrites.delete(filePath);
    }
  }
}

async function waitForPendingFileWrite(filePath: string): Promise<void> {
  await (pendingFileWrites.get(filePath) ?? Promise.resolve());
}

async function replaceJsonFile(filePath: string, value: unknown): Promise<void> {
  const tempFilePath = `${filePath}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(value, null, 2));
  await fs.rename(tempFilePath, filePath);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await withFileWriteLock(filePath, async () => replaceJsonFile(filePath, value));
}

export class WorkflowDefinitionRepository {
  private readonly definitionsPath: string;

  constructor(basePath?: string) {
    const root = basePath ?? getStoragePaths().workflows;
    this.definitionsPath = path.join(root, 'definitions');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.definitionsPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.definitionsPath, id, 'workflow id');
  }

  private async readDefinitionFile(filePath: string): Promise<WorkflowDefinition> {
    const content = await fs.readFile(filePath, 'utf-8');
    const raw = JSON.parse(content) as unknown;
    const parsed = WorkflowDefinitionSchema.safeParse(raw);
    if (parsed.success) {
      return normalizeDefinition(parsed.data);
    }

    const legacy = LegacyWorkflowSchema.parse(raw);
    return normalizeLegacyWorkflow(legacy);
  }

  async listDefinitions(): Promise<WorkflowDefinition[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.definitionsPath);
    const definitions = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => this.readDefinitionFile(path.join(this.definitionsPath, file))),
    );
    return sortByUpdatedAtDesc(definitions);
  }

  async getDefinition(id: string): Promise<WorkflowDefinition | null> {
    try {
      return await this.readDefinitionFile(this.getFilePath(id));
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createDefinition(input: CreateWorkflowDefinitionInput): Promise<WorkflowDefinition> {
    const parsed = CreateWorkflowDefinitionInputSchema.parse(input);
    await this.ensureDir();
    const now = new Date().toISOString();
    const definition = normalizeDefinition(
      WorkflowDefinitionSchema.parse({
        id: parsed.id ?? generateId(),
        name: parsed.name,
        description: parsed.description,
        version: parsed.version ?? 1,
        enabled: parsed.enabled,
        trigger: parsed.trigger,
        nodes: parsed.nodes,
        edges: parsed.edges,
        variables: parsed.variables,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await writeJsonFile(this.getFilePath(definition.id), definition);
    return definition;
  }

  async updateDefinition(
    id: string,
    input: UpdateWorkflowDefinitionInput,
  ): Promise<WorkflowDefinition | null> {
    const parsed = UpdateWorkflowDefinitionInputSchema.parse(input);
    const existing = await this.getDefinition(id);
    if (!existing) {
      return null;
    }
    const definition = normalizeDefinition(
      WorkflowDefinitionSchema.parse({
        ...existing,
        ...parsed,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      }),
    );
    await writeJsonFile(this.getFilePath(id), definition);
    return definition;
  }

  async deleteDefinition(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.getFilePath(id));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }
}

export class WorkflowRunRepository {
  private readonly runsPath: string;

  constructor(basePath?: string) {
    const root = basePath ?? getStoragePaths().workflows;
    this.runsPath = path.join(root, 'runs');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.runsPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.runsPath, id, 'workflow run id');
  }

  private async readRunFile(filePath: string): Promise<WorkflowRun> {
    await waitForPendingFileWrite(filePath);
    return this.readRunFileUnlocked(filePath);
  }

  private async readRunFileUnlocked(filePath: string): Promise<WorkflowRun> {
    const content = await fs.readFile(filePath, 'utf-8');
    return WorkflowRunSchema.parse(JSON.parse(content));
  }

  async createRun(run: WorkflowRun): Promise<WorkflowRun> {
    const parsed = WorkflowRunSchema.parse(run);
    await this.ensureDir();
    await writeJsonFile(this.getFilePath(parsed.id), parsed);
    return parsed;
  }

  async updateRun(id: string, patch: Partial<WorkflowRun>): Promise<WorkflowRun | null> {
    return this.updateRunIf(id, () => true, patch);
  }

  async updateRunIf(
    id: string,
    shouldUpdate: (run: WorkflowRun) => boolean,
    patch: WorkflowRunPatchInput,
  ): Promise<WorkflowRun | null> {
    const filePath = this.getFilePath(id);
    let updatedRun: WorkflowRun | null = null;
    try {
      await withFileWriteLock(filePath, async () => {
        const existing = await this.readRunFileUnlocked(filePath);
        if (!shouldUpdate(existing)) {
          return;
        }
        const resolvedPatch = typeof patch === 'function' ? patch(existing) : patch;
        const updated = WorkflowRunSchema.parse({
          ...existing,
          ...resolvedPatch,
          id: existing.id,
          workflowId: existing.workflowId,
          workflowVersion: existing.workflowVersion,
          createdAt: existing.createdAt,
          updatedAt: resolvedPatch.updatedAt ?? new Date().toISOString(),
        });
        await replaceJsonFile(filePath, updated);
        updatedRun = updated;
      });
      return updatedRun;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    try {
      return await this.readRunFile(this.getFilePath(id));
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async listRuns(query?: WorkflowRunListQuery): Promise<WorkflowRun[]> {
    const parsed = WorkflowRunListQuerySchema.parse(query ?? {});
    await this.ensureDir();
    const files = await fs.readdir(this.runsPath);
    const runs = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => this.readRunFile(path.join(this.runsPath, file))),
    );
    const filtered = runs.filter((run) => {
      if (parsed.workflowId && run.workflowId !== parsed.workflowId) {
        return false;
      }
      if (parsed.status && run.status !== parsed.status) {
        return false;
      }
      return true;
    });
    return sortRunsDesc(filtered).slice(parsed.offset, parsed.offset + parsed.limit);
  }

  async listRunsByWorkflow(workflowId: string): Promise<WorkflowRun[]> {
    return this.listRuns({ workflowId, limit: 200, offset: 0 });
  }
}
