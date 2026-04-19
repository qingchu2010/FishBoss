import { z } from 'zod';
import type { Model } from '../../types/provider.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../../utils/crypto.js';

export const ProviderTypeSchema = z.enum(['openai', 'anthropic', 'ollama', 'custom']);

export const ModelSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().min(1),
  contextWindow: z.number().int().positive(),
  supportedModes: z.array(z.enum(['chat', 'completion', 'embedding'])),
});

export type ModelInput = z.infer<typeof ModelSchema>;

export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ProviderTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKeyEncrypted: z.string().optional(),
  models: z.array(z.string()),
  enabled: z.boolean(),
});

export type ProviderInput = z.infer<typeof ProviderSchema>;

export const CreateProviderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: ProviderTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  models: z.array(z.string()),
  enabled: z.boolean(),
  defaultModels: z.array(z.string()).optional(),
});

export const UpdateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  type: ProviderTypeSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  models: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const CustomModelSchema = z.object({
  name: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
  supportedModes: z.array(z.enum(['chat', 'completion', 'embedding'])).optional(),
});

export const TestModelRequestSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
});

export const FetchModelsRequestSchema = z.object({
  providerId: z.string().min(1),
});

export interface FetchModelsResponse {
  models: ModelResponse[];
  error?: string;
}

export interface ProviderResponse {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic';
  apiKeyMasked: string;
  models: string[];
  enabled: boolean;
}

export interface ModelResponse {
  id: string;
  providerId: string;
  name: string;
  contextWindow: number;
  supportedModes: ('chat' | 'completion' | 'embedding')[];
}

export interface TestModelResponse {
  success: boolean;
  model: string;
  response?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  latencyMs: number;
}

export function encryptProviderApiKey(apiKey: string): string {
  return encryptApiKey(apiKey);
}

export function decryptProviderApiKey(encrypted: string): string {
  return decryptApiKey(encrypted);
}

export function maskProviderApiKey(apiKey: string): string {
  return maskApiKey(apiKey);
}

export function toProviderResponse(provider: { id: string; name: string; type: string; baseUrl?: string; protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic'; apiKeyEncrypted?: string; models: string[]; enabled: boolean }): ProviderResponse {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type as ProviderResponse['type'],
    baseUrl: provider.baseUrl,
    protocol: provider.protocol,
    apiKeyMasked: provider.apiKeyEncrypted ? '********' : '',
    models: provider.models,
    enabled: provider.enabled,
  };
}

export function toModelResponse(model: Model): ModelResponse {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    contextWindow: model.contextWindow,
    supportedModes: model.supportedModes,
  };
}
