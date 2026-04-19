import type { VendorConfig } from './types.js';

export const anthropicVendor: VendorConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  requiresApiKey: true,
  defaultModels: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  description: 'Anthropic Claude API',
  website: 'https://www.anthropic.com',
};
