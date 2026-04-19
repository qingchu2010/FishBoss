import type { Workflow, WorkflowStep } from '../../types/workflow.js';
import type { WorkflowExecutionContext } from './schema.js';
import { WorkflowRepository } from './repository.js';
import { 
  CreateWorkflowInputSchema, 
  UpdateWorkflowInputSchema, 
  ExecuteWorkflowInputSchema,
  toWorkflowResponse,
  type WorkflowResponse 
} from './schema.js';
import { generateId } from '../../utils/string.js';

export class WorkflowService {
  private repository: WorkflowRepository;
  private executions: Map<string, WorkflowExecutionContext>;

  constructor(repository?: WorkflowRepository) {
    this.repository = repository ?? new WorkflowRepository();
    this.executions = new Map();
  }

  async list(): Promise<WorkflowResponse[]> {
    const workflows = await this.repository.list();
    return workflows.map(toWorkflowResponse);
  }

  async get(id: string): Promise<WorkflowResponse | null> {
    const workflow = await this.repository.get(id);
    return workflow ? toWorkflowResponse(workflow) : null;
  }

  async create(data: unknown): Promise<WorkflowResponse> {
    const parsed = CreateWorkflowInputSchema.parse(data);
    const workflow = await this.repository.create(parsed);
    return toWorkflowResponse(workflow);
  }

  async update(id: string, data: unknown): Promise<WorkflowResponse | null> {
    const parsed = UpdateWorkflowInputSchema.parse(data);
    const workflow = await this.repository.update(id, parsed);
    return workflow ? toWorkflowResponse(workflow) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async execute(id: string, input: unknown): Promise<WorkflowExecutionContext> {
    const parsed = ExecuteWorkflowInputSchema.parse(input);
    const workflow = await this.repository.get(id);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${id}`);
    }

    const executionId = generateId();
    const context: WorkflowExecutionContext = {
      executionId,
      workflowId: id,
      status: 'pending',
      input: parsed.input,
    };

    this.executions.set(executionId, context);
    this.runWorkflow(context, workflow).catch(err => {
      context.status = 'failed';
      context.error = err instanceof Error ? err.message : String(err);
      context.stoppedAt = new Date();
    });

    return context;
  }

  getExecution(executionId: string): WorkflowExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  stopExecution(executionId: string): boolean {
    const context = this.executions.get(executionId);
    if (!context) return false;
    
    context.status = 'stopped';
    context.stoppedAt = new Date();
    return true;
  }

  private async runWorkflow(
    context: WorkflowExecutionContext,
    workflow: Workflow
  ): Promise<void> {
    context.status = 'running';
    context.startedAt = new Date();

    try {
      const result = await this.executeSteps(workflow.steps, context.input);
      context.output = result;
      context.status = 'completed';
    } catch (err) {
      context.error = err instanceof Error ? err.message : String(err);
      context.status = 'failed';
    } finally {
      context.stoppedAt = new Date();
    }
  }

  private async executeSteps(
    steps: WorkflowStep[],
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const outputs: Record<string, unknown> = { ...input };

    for (const step of steps) {
      outputs[`step_${step.id}`] = await this.executeStep(step);
    }

    return outputs;
  }

  private async executeStep(step: WorkflowStep): Promise<unknown> {
    switch (step.type) {
      case 'agent':
        return { placeholder: true, message: `Agent step: ${step.name}` };
      case 'tool':
        return { placeholder: true, message: `Tool step: ${step.name}` };
      case 'condition':
        return { placeholder: true, message: `Condition step: ${step.name}` };
      case 'loop':
        return { placeholder: true, message: `Loop step: ${step.name}` };
      default:
        return { placeholder: true, message: `Unknown step type` };
    }
  }
}
