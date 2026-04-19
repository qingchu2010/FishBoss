import type { VendorConfig } from './types.js';

export const qwenVendor: VendorConfig = {
  id: 'qwen',
  name: '通义千问',
  protocol: 'openai',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
  requiresApiKey: true,
  defaultModels: [
    'qwen-turbo',
    'qwen-plus',
    'qwen-max',
    'qwen-max-longcontext',
    'qwen-vl-plus',
    'qwen-vl-max',
  ],
  description: '阿里云通义千问 API',
  website: 'https://tongyi.aliyun.com',
};
