import type { Provider, Model, StreamChunk } from '../../types/provider.js';

export interface ProviderStore {
  list(): Promise<Provider[]>;
  get(id: string): Promise<Provider | null>;
  create(data: Partial<Provider>): Promise<Provider>;
  update(id: string, data: Partial<Provider>): Promise<Provider>;
  delete(id: string): Promise<void>;
}

export interface ModelStore {
  listByProvider(providerId: string): Promise<Model[]>;
  get(id: string): Promise<Model | null>;
}

export interface StreamingClient {
  stream(messages: Record<string, unknown>[], model: string, provider: string): AsyncGenerator<StreamChunk>;
}

export { ProviderService } from './service.js';
export { createProviderRoutes, type ProviderRoutes } from './routes.js';
export { ProviderRepository } from './repository.js';
export * from './schema.js';
