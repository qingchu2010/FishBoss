import type { ProtocolType } from '../protocols/index.js';

export interface VendorModelConfig {
  id: string;
  contextWindow: number;
  supportedModes?: ('chat' | 'completion' | 'embedding')[];
}

export interface VendorConfig {
  id: string;
  name: string;
  protocol: ProtocolType;
  baseUrl: string;
  requiresApiKey: boolean;
  defaultModels?: string[];
  defaultModelCatalog?: VendorModelConfig[];
  supportsModelFetch?: boolean;
  description?: string;
  website?: string;
}

export type VendorPreset = VendorConfig;

export const VENDOR_IDS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  OLLAMA: 'ollama',
  MINIMAX: 'minimax',
  DEEPSEEK: 'deepseek',
  MOONSHOT: 'moonshot',
  ZHIPU: 'zhipu',
  QWEN: 'qwen',
} as const;

export type VendorId = (typeof VENDOR_IDS)[keyof typeof VENDOR_IDS];
