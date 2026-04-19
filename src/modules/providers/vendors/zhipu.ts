import type { VendorConfig } from './types.js';

export const zhipuVendor: VendorConfig = {
  id: 'zhipu',
  name: '智谱 AI',
  protocol: 'openai',
  baseUrl: 'https://open.bigmodel.cn',
  requiresApiKey: true,
  defaultModels: [
    'glm-4-plus',
    'glm-4-0520',
    'glm-4-air',
    'glm-4-airx',
    'glm-4-flash',
    'glm-4v-plus',
    'glm-4v',
  ],
  description: '智谱 AI GLM API',
  website: 'https://open.bigmodel.cn',
};
