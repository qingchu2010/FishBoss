import { z } from 'zod';

export const WorkflowTriggerSourceSchema = z.enum([
  'manual',
  'schedule',
  'chat-console',
  'qq',
  'onebot',
  'api',
]);

export const WorkflowRunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
]);

export const WorkflowNodeStatusSchema = z.enum([
  'pending',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
]);

export const WorkflowNodeTypeSchema = z.enum([
  'start',
  'agent',
  'tool',
  'condition',
  'databaseWrite',
  'end',
]);

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['manual', 'schedule', 'platformMessage', 'api']),
  config: z.record(z.unknown()).optional().default({}),
});

export const WorkflowNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const WorkflowEdgeMetadataSchema = z.record(z.unknown());

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  fromHandle: z.string().min(1).optional(),
  toHandle: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  label: z.string().optional(),
  metadata: WorkflowEdgeMetadataSchema.optional(),
});

export const WorkflowNodeDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  config: z.record(z.unknown()).optional().default({}),
  position: WorkflowNodePositionSchema.optional(),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  trigger: WorkflowTriggerSchema,
  nodes: z.array(WorkflowNodeDefinitionSchema),
  edges: z.array(WorkflowEdgeSchema),
  variables: z.record(z.unknown()).optional().default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorkflowNodeStateSchema = z.object({
  nodeId: z.string().min(1),
  status: WorkflowNodeStatusSchema,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  attempt: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});

export const WorkflowRunSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  workflowVersion: z.number().int().positive(),
  status: WorkflowRunStatusSchema,
  triggerSource: WorkflowTriggerSourceSchema,
  triggerPayload: z.record(z.unknown()),
  context: z.record(z.unknown()),
  nodeStates: z.record(WorkflowNodeStateSchema),
  result: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const LegacyWorkflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['agent', 'tool', 'condition', 'loop']),
  config: z.record(z.unknown()),
  next: z.array(z.string()).optional(),
});

export const LegacyWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  steps: z.array(LegacyWorkflowStepSchema),
  enabled: z.boolean(),
  createdAt: z.union([z.string().datetime(), z.date()]),
  updatedAt: z.union([z.string().datetime(), z.date()]),
});

export const CreateWorkflowDefinitionInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
  version: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
  trigger: WorkflowTriggerSchema.default({ type: 'manual', config: {} }),
  nodes: z.array(WorkflowNodeDefinitionSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  variables: z.record(z.unknown()).optional().default({}),
});

export const UpdateWorkflowDefinitionInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  version: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  trigger: WorkflowTriggerSchema.optional(),
  nodes: z.array(WorkflowNodeDefinitionSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  variables: z.record(z.unknown()).optional(),
});

export const RunWorkflowInputSchema = z.object({
  triggerPayload: z.record(z.unknown()).optional().default({}),
  triggerSource: WorkflowTriggerSourceSchema.optional().default('manual'),
});

export const WorkflowRunListQuerySchema = z.object({
  workflowId: z.string().min(1).optional(),
  status: WorkflowRunStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export const WorkflowIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const WorkflowRunIdParamsSchema = z.object({
  runId: z.string().min(1),
});

export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;
export type WorkflowTriggerSource = z.infer<typeof WorkflowTriggerSourceSchema>;
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;
export type WorkflowNodeStatus = z.infer<typeof WorkflowNodeStatusSchema>;
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>;
export type WorkflowNodePosition = z.infer<typeof WorkflowNodePositionSchema>;
export type WorkflowEdgeMetadata = z.infer<typeof WorkflowEdgeMetadataSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowNodeDefinition = z.infer<typeof WorkflowNodeDefinitionSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowNodeState = z.infer<typeof WorkflowNodeStateSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type LegacyWorkflow = z.infer<typeof LegacyWorkflowSchema>;
export type CreateWorkflowDefinitionInput = z.infer<typeof CreateWorkflowDefinitionInputSchema>;
export type UpdateWorkflowDefinitionInput = z.infer<typeof UpdateWorkflowDefinitionInputSchema>;
export type RunWorkflowInput = z.infer<typeof RunWorkflowInputSchema>;
export type WorkflowRunListQuery = z.infer<typeof WorkflowRunListQuerySchema>;
export type WorkflowIdParams = z.infer<typeof WorkflowIdParamsSchema>;
export type WorkflowRunIdParams = z.infer<typeof WorkflowRunIdParamsSchema>;

export function toWorkflowDefinitionResponse(workflow: WorkflowDefinition): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse(workflow);
}

export function toWorkflowRunResponse(run: WorkflowRun): WorkflowRun {
  return WorkflowRunSchema.parse(run);
}
