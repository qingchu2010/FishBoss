import { LLMClient, type LLMClientConfig, type ChatCompletionOptions, type ChatCompletionResponse, type ModelInfo } from '../base.js';
import type { ProviderToolChoice, ProviderToolDefinition, StreamChunk } from '../../../../types/provider.js';
import { getLogger } from '../../../../server/logging/index.js';
import { readServerSentEvents } from '../sse.js';

const logger = getLogger();

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000 },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 },
];

interface AnthropicResponse {
  id: string;
  model: string;
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  message?: { usage?: { input_tokens: number; output_tokens: number } };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface AnthropicRequestTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function toAnthropicRequestTools(
  tools?: ProviderToolDefinition[],
): AnthropicRequestTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function toAnthropicToolChoice(
  toolChoice?: ProviderToolChoice,
): { type: 'auto' | 'any' | 'tool'; name?: string } | undefined {
  if (!toolChoice || toolChoice === 'none') {
    return undefined;
  }

  if (toolChoice === 'auto') {
    return { type: 'auto' };
  }

  if (toolChoice === 'required') {
    return { type: 'any' };
  }

  return {
    type: 'tool',
    name: toolChoice.name,
  };
}

export class AnthropicClient extends LLMClient {
  constructor(config: LLMClientConfig) {
    super(config);
  }

  async fetchModels(): Promise<ModelInfo[]> {
    return ANTHROPIC_MODELS;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.config.apiKey) {
      throw new Error('API Key is required');
    }

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const otherMessages = options.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: toAnthropicRequestTools(options.tools),
        tool_choice: toAnthropicToolChoice(options.toolChoice),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const textContent = data.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      id: data.id,
      model: data.model,
      content: textContent || '',
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }

  async streamChat(
    options: ChatCompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('API Key is required');
    }

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const otherMessages = options.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        tools: toAnthropicRequestTools(options.tools),
        tool_choice: toAnthropicToolChoice(options.toolChoice),
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error('No response body');
    }

    for await (const message of readServerSentEvents(body)) {
      const data = message.data;
      try {
        const event = JSON.parse(data) as AnthropicStreamEvent;
        const usage = event.message?.usage ?? event.usage;
        if (usage) {
          const promptTokens = usage.input_tokens;
          const completionTokens = usage.output_tokens;
          onChunk({
            delta: '',
            done: false,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens:
                (promptTokens ?? 0) + (completionTokens ?? 0),
            },
          });
        }
        if (event.type === 'content_block_delta' && event.delta?.text) {
          onChunk({ delta: event.delta.text, done: false });
        } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          onChunk({
            delta: '',
            done: false,
            toolCallDeltas: [{
              id: event.content_block.id,
              name: event.content_block.name,
              argumentsDelta: event.content_block.input ? JSON.stringify(event.content_block.input) : undefined,
              index: event.index,
            }],
          });
        } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          onChunk({
            delta: '',
            done: false,
            toolCallDeltas: [{
              argumentsDelta: event.delta.partial_json,
              index: event.index,
            }],
          });
        } else if (event.type === 'message_stop') {
          onChunk({ delta: '', done: true });
          return;
        }
      } catch (error) {
        logger.warn('Failed to parse Anthropic stream event', {
          data,
          error: String(error),
        });
      }
    }

    onChunk({ delta: '', done: true });
  }

  async testConnection(model: string, testMessage?: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.chat({
        model,
        messages: [{ role: 'user', content: testMessage || 'Hi' }],
        maxTokens: 10,
      });
      return { success: true, latencyMs: Date.now() - startTime };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
