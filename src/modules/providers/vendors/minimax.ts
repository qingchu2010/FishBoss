import type { VendorConfig } from './types.js';

export const minimaxVendor: VendorConfig = {
  id: 'minimax',
  name: 'MiniMax',
  protocol: 'openai',
  baseUrl: 'https://api.minimaxi.com',
  requiresApiKey: true,
  defaultModels: [
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2',
    'MiniMax-M1',
    'MiniMax-Text-01',
  ],
  defaultModelCatalog: [
    { id: 'MiniMax-M2.7', contextWindow: 204800 },
    { id: 'MiniMax-M2.7-highspeed', contextWindow: 204800 },
    { id: 'MiniMax-M2.5', contextWindow: 204800 },
    { id: 'MiniMax-M2.5-highspeed', contextWindow: 204800 },
    { id: 'MiniMax-M2', contextWindow: 204800 },
    { id: 'MiniMax-M1', contextWindow: 1048576 },
    { id: 'MiniMax-Text-01', contextWindow: 1048576 },
  ],
  supportsModelFetch: false,
  description: 'MiniMax AI API',
  website: 'https://www.minimaxi.com',
};
