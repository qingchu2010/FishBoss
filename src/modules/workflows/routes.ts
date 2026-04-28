import type { WorkflowDefinition, WorkflowRun } from './schema.js';
import { WorkflowService } from './service.js';

export interface WorkflowRoutes {
  list(): Promise<WorkflowDefinition[]>;
  get(id: string): Promise<WorkflowDefinition | null>;
  create(data: unknown): Promise<WorkflowDefinition>;
  update(id: string, data: unknown): Promise<WorkflowDefinition | null>;
  delete(id: string): Promise<boolean>;
  run(id: string, input: unknown): Promise<WorkflowRun>;
  listRuns(query?: unknown): Promise<WorkflowRun[]>;
  getRun(runId: string): Promise<WorkflowRun | null>;
  cancelRun(runId: string): Promise<WorkflowRun | null>;
}

export function createWorkflowRoutes(service?: WorkflowService): WorkflowRoutes {
  const svc = service ?? new WorkflowService();

  return {
    list: () => svc.list(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    run: (id, input) => svc.run(id, input),
    listRuns: (query) => svc.listRuns(query),
    getRun: (runId) => svc.getRun(runId),
    cancelRun: (runId) => svc.cancelRun(runId),
  };
}
