import type { ProviderResponse, ModelResponse, TestModelResponse, FetchModelsResponse } from './schema.js';
import { ProviderService } from './service.js';

export interface ProviderRoutes {
  list(): Promise<ProviderResponse[]>;
  listProviderMetadata(): Promise<{
    types: Array<{ type: 'openai' | 'anthropic' | 'ollama' | 'custom'; protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'; defaultBaseUrl?: string; requiresApiKey: boolean }>;
    presets: Array<{ name: string; type: 'openai' | 'anthropic' | 'ollama' | 'custom'; protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'; baseUrl?: string; requiresApiKey: boolean }>;
  }>;
  get(id: string): Promise<ProviderResponse | null>;
  create(data: unknown): Promise<ProviderResponse>;
  update(id: string, data: unknown): Promise<ProviderResponse | null>;
  delete(id: string): Promise<boolean>;
  listModels(providerId: string): Promise<ModelResponse[]>;
  getModel(providerId: string, modelId: string): Promise<ModelResponse | null>;
  addCustomModel(providerId: string, data: unknown): Promise<ModelResponse | null>;
  testModel(data: unknown): Promise<TestModelResponse>;
  fetchModels(data: unknown): Promise<FetchModelsResponse>;
}

export function createProviderRoutes(service?: ProviderService): ProviderRoutes {
  const svc = service ?? new ProviderService();

  return {
    list: () => svc.list(),
    listProviderMetadata: () => svc.listProviderMetadata(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    listModels: (providerId) => svc.listModels(providerId),
    getModel: (providerId, modelId) => svc.getModel(providerId, modelId),
    addCustomModel: (providerId, data) => svc.addCustomModel(providerId, data),
    testModel: (data) => svc.testModel(data),
    fetchModels: (data) => svc.fetchModels(data),
  };
}
