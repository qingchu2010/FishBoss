import type { VendorConfig } from './types.js';

export const deepseekVendor: VendorConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  protocol: 'openai',
  baseUrl: 'https://api.deepseek.com',
  requiresApiKey: true,
  defaultModels: [
    'deepseek-chat',
    'deepseek-coder',
    'deepseek-reasoner',
  ],
  description: 'DeepSeek AI API',
  website: 'https://www.deepseek.com',
};
