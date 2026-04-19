import type { VendorConfig } from './types.js';

export const ollamaVendor: VendorConfig = {
  id: 'ollama',
  name: 'Ollama',
  protocol: 'ollama',
  baseUrl: 'http://localhost:11434',
  requiresApiKey: false,
  description: 'Local LLM inference with Ollama',
  website: 'https://ollama.ai',
};
