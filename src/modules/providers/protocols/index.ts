import { LLMClient, type LLMClientConfig } from './base.js';
import { OpenAIClient } from './openai/index.js';
import { AnthropicClient } from './anthropic/index.js';
import { OllamaClient } from './ollama/index.js';

export type ProtocolType = 'openai' | 'anthropic' | 'ollama' | 'generic';

export { LLMClient, type LLMClientConfig } from './base.js';
export { OpenAIClient } from './openai/index.js';
export { AnthropicClient } from './anthropic/index.js';
export { OllamaClient } from './ollama/index.js';

export function createLLMClient(
  protocol: ProtocolType,
  config: LLMClientConfig
): LLMClient {
  switch (protocol) {
    case 'openai':
    case 'generic':
      return new OpenAIClient(config);
    case 'anthropic':
      return new AnthropicClient(config);
    case 'ollama':
      return new OllamaClient(config);
    default:
      return new OpenAIClient(config);
  }
}

export function detectProtocol(
  type: string | undefined,
  baseUrl: string | undefined
): ProtocolType {
  if (type === 'openai') return 'openai';
  if (type === 'anthropic') return 'anthropic';
  if (type === 'ollama') return 'ollama';

  const url = (baseUrl || '').toLowerCase();
  if (url.includes('anthropic')) return 'anthropic';
  if (url.includes('ollama') || url.includes(':11434')) return 'ollama';
  
  return 'openai';
}
