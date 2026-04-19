export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'agent' | 'tool' | 'condition' | 'loop';
  config: Record<string, unknown>;
  next?: string[];
}
