export interface ProviderToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ProviderToolChoice = 'auto' | 'none' | 'required' | {
  type: 'tool';
  name: string;
};

export interface StreamToolCallDelta {
  id?: string;
  name?: string;
  argumentsDelta?: string;
  index?: number;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface Provider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic';
  apiKeyEncrypted?: string;
  models: string[];
  modelCatalog?: Model[];
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Model {
  id: string;
  providerId: string;
  name: string;
  contextWindow: number;
  supportedModes: ('chat' | 'completion' | 'embedding')[];
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  tokens?: number;
  usage?: ProviderUsage;
  toolCallDeltas?: StreamToolCallDelta[];
}
