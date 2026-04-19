import type { WorkflowResponse, WorkflowExecutionContext } from './schema.js';
import { WorkflowService } from './service.js';

export interface WorkflowRoutes {
  list(): Promise<WorkflowResponse[]>;
  get(id: string): Promise<WorkflowResponse | null>;
  create(data: unknown): Promise<WorkflowResponse>;
  update(id: string, data: unknown): Promise<WorkflowResponse | null>;
  delete(id: string): Promise<boolean>;
  execute(id: string, input: unknown): Promise<WorkflowExecutionContext>;
  getExecution(executionId: string): WorkflowExecutionContext | undefined;
  stopExecution(executionId: string): boolean;
}

export function createWorkflowRoutes(service?: WorkflowService): WorkflowRoutes {
  const svc = service ?? new WorkflowService();

  return {
    list: () => svc.list(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    execute: (id, input) => svc.execute(id, input),
    getExecution: (executionId) => svc.getExecution(executionId),
    stopExecution: (executionId) => svc.stopExecution(executionId),
  };
}
