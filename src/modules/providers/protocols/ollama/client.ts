import { LLMClient, type LLMClientConfig, type ChatCompletionOptions, type ChatCompletionResponse, type ModelInfo } from '../base.js';
import type { StreamChunk } from '../../../../types/provider.js';

interface OllamaModelsResponse {
  models?: Array<{ name: string; model?: string; details?: { parameter_size?: string } }>;
}

interface OllamaChatResponse {
  model: string;
  message?: { content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaClient extends LLMClient {
  constructor(config: LLMClientConfig) {
    super(config);
  }

  async fetchModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);

      if (!response.ok) {
        console.log(`[Ollama] Error response: HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as OllamaModelsResponse;
      return (data.models || []).map((m) => ({
        id: m.name || m.model || 'unknown',
        name: m.name || m.model,
      }));
    } catch (err) {
      console.log(`[Ollama] Fetch error:`, err);
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

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onChunk({ delta: '', done: true });
        break;
      }

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaChatResponse;
          if (data.prompt_eval_count !== undefined || data.eval_count !== undefined) {
            onChunk({
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
            onChunk({ delta: data.message.content, done: false });
          }
          if (data.done) {
            onChunk({ delta: '', done: true });
            return;
          }
        } catch {
          // Skip invalid JSON
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
