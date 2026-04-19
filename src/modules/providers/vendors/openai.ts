import type { VendorConfig } from './types.js';

export const openaiVendor: VendorConfig = {
  id: 'openai',
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com',
  requiresApiKey: true,
  defaultModels: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o1-mini',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  description: 'OpenAI official API',
  website: 'https://platform.openai.com',
};
