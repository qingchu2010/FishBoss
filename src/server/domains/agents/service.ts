import { getAgentRepository } from './repository.js';
import { getConversationService } from '../conversations/service.js';
import type {
  AgentSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  TestAgentSchema,
} from './schemas.js';

export interface TestResult {
  messageId: string;
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: unknown;
    error?: string;
  }>;
  metadata?: {
    finishReason?: string;
    tokens?: number;
  };
}

export interface StreamingTestResult {
  jobId: string;
  messageId: string;
}

export class AgentService {
  private repository = getAgentRepository();
  private conversationService = getConversationService();

  async listAgents(options?: { limit?: number; offset?: number }): Promise<AgentSchema[]> {
    return this.repository.list(options);
  }

  async getAgent(id: string): Promise<AgentSchema | null> {
    return this.repository.get(id);
  }

  async createAgent(data: CreateAgentSchema): Promise<AgentSchema> {
    return this.repository.create(data);
  }

  async updateAgent(id: string, data: UpdateAgentSchema): Promise<AgentSchema | null> {
    return this.repository.update(id, data);
  }

  async deleteAgent(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async testAgent(data: TestAgentSchema): Promise<TestResult> {
    const agent = await this.repository.get(data.agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const conversationId = data.conversationId ?? `test_${Date.now()}`;

    const userMessage = await this.conversationService.appendMessage(conversationId, {
      role: 'user',
      content: data.message,
    });

    if (!userMessage) {
      throw new Error('Failed to create user message');
    }

    const allowedTools = agent.toolPermissions?.allowedTools ?? agent.tools;
    const deniedTools = agent.toolPermissions?.deniedTools ?? [];

    const availableTools = allowedTools.filter((t) => !deniedTools.includes(t));

    const placeholderContent = `[TEST PLACEHOLDER] Agent "${agent.name}" would respond to: "${data.message}". Model: ${agent.model ?? 'default'}, Provider: ${agent.provider ?? 'default'}. Tools available: ${availableTools.join(', ') || 'none'}`;

    const assistantMessage = await this.conversationService.appendMessage(conversationId, {
      role: 'assistant',
      content: placeholderContent,
      metadata: { finishReason: 'stop', tokens: placeholderContent.length },
    });

    if (!assistantMessage) {
      throw new Error('Failed to create assistant message');
    }

    return {
      messageId: assistantMessage.id,
      content: placeholderContent,
      toolCalls: [],
      metadata: { finishReason: 'stop', tokens: placeholderContent.length },
    };
  }

  async testAgentStreaming(data: TestAgentSchema): Promise<StreamingTestResult> {
    const agent = await this.repository.get(data.agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const conversationId = data.conversationId ?? `test_${Date.now()}`;

    await this.conversationService.appendMessage(conversationId, {
      role: 'user',
      content: data.message,
    });

    const allowedTools = agent.toolPermissions?.allowedTools ?? agent.tools;
    const deniedTools = agent.toolPermissions?.deniedTools ?? [];
    const availableTools = allowedTools.filter((t) => !deniedTools.includes(t));

    const { jobId, messageId } = await this.conversationService.executeStreaming(
      conversationId,
      data.message,
      {
        model: agent.model,
        provider: agent.provider,
        tools: availableTools,
      }
    );

    return { jobId, messageId };
  }

  async validateToolPermissions(agentId: string, toolNames: string[]): Promise<{ valid: boolean; denied: string[] }> {
    const agent = await this.repository.get(agentId);
    if (!agent) {
      return { valid: false, denied: toolNames };
    }

    const allowedTools = agent.toolPermissions?.allowedTools;
    const deniedTools = agent.toolPermissions?.deniedTools ?? [];

    if (allowedTools) {
      const notAllowed = toolNames.filter((t) => !allowedTools.includes(t));
      return { valid: notAllowed.length === 0, denied: notAllowed };
    }

    const denied = toolNames.filter((t) => deniedTools.includes(t));
    return { valid: denied.length === 0, denied };
  }
}

let serviceInstance: AgentService | null = null;

export function getAgentService(): AgentService {
  if (!serviceInstance) {
    serviceInstance = new AgentService();
  }
  return serviceInstance;
}
