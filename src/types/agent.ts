export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  model?: string;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecution {
  agentId: string;
  conversationId: string;
  input: string;
  output?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}
