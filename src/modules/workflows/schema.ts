import { z } from 'zod';

export const WorkflowStepInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['agent', 'tool', 'condition', 'loop']),
  config: z.record(z.unknown()),
  next: z.array(z.string()).optional(),
});

export type WorkflowStepInput = z.infer<typeof WorkflowStepInputSchema>;

export const WorkflowInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  steps: z.array(WorkflowStepInputSchema),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkflowInputType = z.infer<typeof WorkflowInputSchema>;

export const CreateWorkflowInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  steps: z.array(WorkflowStepInputSchema),
  enabled: z.boolean(),
});

export const UpdateWorkflowInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  steps: z.array(WorkflowStepInputSchema).optional(),
  enabled: z.boolean().optional(),
});

export const ExecuteWorkflowInputSchema = z.object({
  input: z.record(z.unknown()),
});

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

export interface WorkflowResponse {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStepInput[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toWorkflowResponse(workflow: { id: string; name: string; description: string; steps: WorkflowStepInput[]; enabled: boolean; createdAt: Date; updatedAt: Date }): WorkflowResponse {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    steps: workflow.steps,
    enabled: workflow.enabled,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}
