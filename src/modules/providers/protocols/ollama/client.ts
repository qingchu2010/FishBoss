import { LLMClient, type LLMClientConfig, type ChatCompletionOptions, type ChatCompletionResponse, type ModelInfo } from '../base.js';
import type { StreamChunk } from '../../../../types/provider.js';
import { getLogger } from '../../../../server/logging/index.js';
import { readNewlineDelimitedJson } from '../ndjson.js';

const logger = getLogger();

interface OllamaModelsResponse {
  models?: Array<{ name: string; model?: string; details?: { parameter_size?: string } }>;
}

export interface OllamaChatResponse {
  model: string;
  message?: { content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function toOllamaStreamChunks(data: OllamaChatResponse): StreamChunk[] {
  const chunks: StreamChunk[] = [];

  if (data.prompt_eval_count !== undefined || data.eval_count !== undefined) {
    chunks.push({
      delta: '',
      done: false,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens:
          (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    });
  }

  if (data.message?.content) {
    chunks.push({ delta: data.message.content, done: false });
  }

  if (data.done) {
    chunks.push({ delta: '', done: true });
  }

  return chunks;
}

export class OllamaClient extends LLMClient {
  constructor(config: LLMClientConfig) {
    super(config);
  }

  async fetchModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);

      if (!response.ok) {
        logger.warn('Ollama model fetch returned an error response', {
          status: response.status,
        });
        return [];
      }

      const data = (await response.json()) as OllamaModelsResponse;
      return (data.models || []).map((m) => ({
        id: m.name || m.model || 'unknown',
        name: m.name || m.model,
      }));
    } catch (err) {
      logger.warn('Ollama model fetch failed', { error: String(err) });
      return [];
    }
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = (await response.json()) as OllamaChatResponse;

    return {
      id: `ollama-${Date.now()}`,
      model: data.model,
      content: data.message?.content || '',
      usage: data.prompt_eval_count !== undefined && data.eval_count !== undefined
        ? {
            promptTokens: data.prompt_eval_count,
            completionTokens: data.eval_count,
            totalTokens: data.prompt_eval_count + data.eval_count,
          }
        : undefined,
    };
  }

  async streamChat(
    options: ChatCompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens,
        },
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

    for await (const data of readNewlineDelimitedJson<OllamaChatResponse>(
      body,
      {
        onInvalidLine(line, error) {
          logger.warn('Failed to parse Ollama stream line', {
            line,
            error: String(error),
          });
        },
      },
    )) {
      for (const chunk of toOllamaStreamChunks(data)) {
        onChunk(chunk);
        if (chunk.done) {
          return;
        }
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
