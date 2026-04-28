export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: number;
  enabled: boolean;
  trigger: {
    type: 'manual' | 'schedule' | 'platformMessage' | 'api';
    config?: Record<string, unknown>;
  };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: 'start' | 'agent' | 'tool' | 'condition' | 'databaseWrite' | 'end';
  config: Record<string, unknown>;
  position?: WorkflowNodePosition;
}

export interface WorkflowEdge {
  id?: string;
  from: string;
  to: string;
  fromHandle?: string;
  toHandle?: string;
  branch?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';
  triggerSource: 'manual' | 'schedule' | 'chat-console' | 'qq' | 'onebot' | 'api';
  triggerPayload: Record<string, unknown>;
  context: Record<string, unknown>;
  nodeStates: Record<string, WorkflowNodeState>;
  result?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface WorkflowNodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';
  input?: unknown;
  output?: unknown;
  error?: string;
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
}
