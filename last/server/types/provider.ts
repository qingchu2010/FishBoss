export type ProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'gemini' 
  | 'minimax' 
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'baidu'
  | 'alibaba'
  | 'custom'

export interface ProviderInfo {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  envKey?: string
  defaultHeaders?: Record<string, string>
  defaultModels?: string[]
}

export const PROVIDER_INFO: Record<ProviderType, ProviderInfo> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultHeaders: {},
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    defaultHeaders: {
      'anthropic-version': '2023-06-01'
    },
    defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    envKey: 'GOOGLE_API_KEY',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    type: 'minimax',
    baseUrl: 'https://api.minimaxi.com',
    envKey: 'MINIMAX_API_KEY',
    defaultModels: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2']
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner']
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    type: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    envKey: 'MOONSHOT_API_KEY',
    defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  zhipu: {
    id: 'zhipu',
    name: 'ZhiPu',
    type: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    envKey: 'ZHIPU_API_KEY',
    defaultModels: ['glm-4', 'glm-4-flash', 'glm-4-plus']
  },
  baidu: {
    id: 'baidu',
    name: 'Baidu',
    type: 'baidu',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    envKey: 'BAIDU_API_KEY',
    defaultModels: ['ernie-4.0-8k', 'ernie-3.5-8k']
  },
  alibaba: {
    id: 'alibaba',
    name: 'Alibaba Qwen',
    type: 'alibaba',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    envKey: 'ALIBABA_API_KEY',
    defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo']
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    type: 'custom',
    baseUrl: '',
    envKey: undefined,
    defaultModels: []
  }
}
