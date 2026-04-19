import type { Workflow } from '../../types/workflow.js';

export interface WorkflowStore {
  list(): Promise<Workflow[]>;
  get(id: string): Promise<Workflow | null>;
  create(data: Partial<Workflow>): Promise<Workflow>;
  update(id: string, data: Partial<Workflow>): Promise<Workflow>;
  delete(id: string): Promise<void>;
}

export interface WorkflowRunner {
  execute(workflowId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  stop(executionId: string): void;
}

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  stoppedAt?: Date;
  currentStep?: string;
}

export { WorkflowService } from './service.js';
export { createWorkflowRoutes, type WorkflowRoutes } from './routes.js';
export { WorkflowRepository } from './repository.js';
export * from './schema.js';
