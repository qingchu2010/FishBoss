import type { VendorConfig } from './types.js';

export const moonshotVendor: VendorConfig = {
  id: 'moonshot',
  name: 'Moonshot (月之暗面)',
  protocol: 'openai',
  baseUrl: 'https://api.moonshot.cn',
  requiresApiKey: true,
  defaultModels: [
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
  ],
  description: 'Moonshot AI API',
  website: 'https://www.moonshot.cn',
};
