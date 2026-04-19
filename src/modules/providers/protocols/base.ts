import type {
  ProviderToolChoice,
  ProviderToolDefinition,
  StreamChunk,
} from '../../../types/provider.js';

export interface LLMClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ProviderToolDefinition[];
  toolChoice?: ProviderToolChoice;
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
}

export abstract class LLMClient {
  protected config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = config;
  }

  abstract fetchModels(): Promise<ModelInfo[]>;
  
  abstract chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;
  
  abstract streamChat(
    options: ChatCompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;

  abstract testConnection(model: string, testMessage?: string): Promise<{ success: boolean; latencyMs: number; error?: string }>;
}
