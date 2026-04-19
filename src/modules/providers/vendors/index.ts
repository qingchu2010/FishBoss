import type { VendorConfig, VendorPreset } from './types.js';
import { openaiVendor } from './openai.js';
import { anthropicVendor } from './anthropic.js';
import { ollamaVendor } from './ollama.js';
import { minimaxVendor } from './minimax.js';
import { deepseekVendor } from './deepseek.js';
import { moonshotVendor } from './moonshot.js';
import { zhipuVendor } from './zhipu.js';
import { qwenVendor } from './qwen.js';

export * from './types.js';
export { openaiVendor } from './openai.js';
export { anthropicVendor } from './anthropic.js';
export { ollamaVendor } from './ollama.js';
export { minimaxVendor } from './minimax.js';
export { deepseekVendor } from './deepseek.js';
export { moonshotVendor } from './moonshot.js';
export { zhipuVendor } from './zhipu.js';
export { qwenVendor } from './qwen.js';

export const allVendors: VendorConfig[] = [
  openaiVendor,
  anthropicVendor,
  ollamaVendor,
  minimaxVendor,
  deepseekVendor,
  moonshotVendor,
  zhipuVendor,
  qwenVendor,
];

export function getVendorById(id: string): VendorConfig | undefined {
  return allVendors.find((v) => v.id === id);
}

export function resolveVendorConfig(input: {
  id?: string;
  type?: string;
  baseUrl?: string;
  name?: string;
}): VendorConfig | undefined {
  if (input.id) {
    const byId = getVendorById(input.id);
    if (byId) {
      return byId;
    }
  }

  const normalizedBaseUrl = input.baseUrl?.trim().replace(/\/+$/, '').toLowerCase();
  if (normalizedBaseUrl) {
    const byBaseUrl = allVendors.find((vendor) => vendor.baseUrl.trim().replace(/\/+$/, '').toLowerCase() === normalizedBaseUrl);
    if (byBaseUrl) {
      return byBaseUrl;
    }
  }

  const normalizedName = input.name?.trim().toLowerCase();
  if (normalizedName) {
    const byName = allVendors.find((vendor) => vendor.name.toLowerCase() === normalizedName || vendor.id.toLowerCase() === normalizedName);
    if (byName) {
      return byName;
    }
  }

  if (input.type) {
    return getVendorById(input.type);
  }

  return undefined;
}

export function getVendorPresets(): VendorPreset[] {
  return allVendors.map((v) => ({
    ...v,
    id: v.id,
    name: v.name,
    protocol: v.protocol,
    baseUrl: v.baseUrl,
    requiresApiKey: v.requiresApiKey,
    defaultModels: v.defaultModels ?? v.defaultModelCatalog?.map((model) => model.id),
    description: v.description,
    website: v.website,
  }));
}
