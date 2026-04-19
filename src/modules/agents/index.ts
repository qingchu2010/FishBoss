import type { Agent, AgentExecution } from '../../types/index.js';

export interface AgentStore {
  list(): Promise<Agent[]>;
  get(id: string): Promise<Agent | null>;
  create(data: Partial<Agent>): Promise<Agent>;
  update(id: string, data: Partial<Agent>): Promise<Agent>;
  delete(id: string): Promise<void>;
}

export interface AgentRunner {
  run(execution: AgentExecution): Promise<AgentExecution>;
  stop(executionId: string): void;
}
