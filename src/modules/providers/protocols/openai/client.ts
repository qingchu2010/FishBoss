import { LLMClient, type LLMClientConfig, type ChatCompletionOptions, type ChatCompletionResponse, type ModelInfo } from '../base.js';
import type { ProviderToolChoice, ProviderToolDefinition, StreamChunk } from '../../../../types/provider.js';

interface OpenAIToolFunction {
  name?: string;
  arguments?: string;
}

interface OpenAIToolCall {
  id?: string;
  index?: number;
  type?: string;
  function?: OpenAIToolFunction;
}

interface OpenAIModelsResponse {
  data?: Array<{ id: string; name?: string }>;
}

interface OpenAIChatResponse {
  id: string;
  model: string;
  choices?: Array<{
    message?: { content?: string; tool_calls?: OpenAIToolCall[] };
    delta?: { content?: string; tool_calls?: OpenAIToolCall[] };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIRequestTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toOpenAIRequestTools(
  tools?: ProviderToolDefinition[],
): OpenAIRequestTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function toOpenAIToolChoice(
  toolChoice?: ProviderToolChoice,
): 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } } | undefined {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === 'string') {
    return toolChoice;
  }

  return {
    type: 'function',
    function: {
      name: toolChoice.name,
    },
  };
}

export class OpenAIClient extends LLMClient {
  constructor(config: LLMClientConfig) {
    super(config);
  }

  async fetchModels(): Promise<ModelInfo[]> {
    const endpoints = [
      '/v1/models',
      '/api/v1/models',
    ];

    for (const endpoint of endpoints) {
      const url = `${this.config.baseUrl}${endpoint}`;
      console.log(`[OpenAI] Fetching models from: ${url}`);
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(url, { headers });

        console.log(`[OpenAI] Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[OpenAI] Error response: ${errorText}`);
          continue;
        }

        const data = (await response.json()) as OpenAIModelsResponse;
        console.log(`[OpenAI] Models found: ${data.data?.length ?? 0}`);
        
        if (data.data && data.data.length > 0) {
          return data.data.map((m) => ({
            id: m.id,
            name: m.name || m.id,
          }));
        }
      } catch (err) {
        console.log(`[OpenAI] Fetch error for ${endpoint}:`, err);
      }
    }

    console.log(`[OpenAI] No models found or endpoint not available`);
    return [];
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.config.apiKey) {
      throw new Error('API Key is required');
    }

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: false,
        tools: toOpenAIRequestTools(options.tools),
        tool_choice: toOpenAIToolChoice(options.toolChoice),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const choice = data.choices?.[0];

    return {
      id: data.id,
      model: data.model,
      content: choice?.message?.content || '',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
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

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        tools: toOpenAIRequestTools(options.tools),
        tool_choice: toOpenAIToolChoice(options.toolChoice),
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onChunk({ delta: '', done: true });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            onChunk({ delta: '', done: true });
            return;
          }
          try {
            const parsed = JSON.parse(data) as OpenAIChatResponse;
            const choice = parsed.choices?.[0];
            const delta = choice?.delta?.content || '';
            const toolCallDeltas = choice?.delta?.tool_calls?.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.function?.name,
              argumentsDelta: toolCall.function?.arguments,
              index: toolCall.index,
            })) ?? [];
            if (parsed.usage) {
              onChunk({
                delta: '',
                done: false,
                usage: {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                },
              });
            }
            if (delta) {
              onChunk({ delta, done: false });
            }
            if (toolCallDeltas.length > 0) {
              onChunk({ delta: '', done: false, toolCallDeltas });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
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
