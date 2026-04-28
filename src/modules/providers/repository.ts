import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoragePaths } from '../../storage/paths.js';
import type { Provider, Model } from '../../types/provider.js';
import { resolveSafeJsonEntityPath } from '../../utils/path.js';
import { generateId } from '../../utils/string.js';
import { encryptProviderApiKey } from './schema.js';
import { detectProtocol, type ProtocolType } from './protocols/index.js';
import { resolveVendorConfig } from './vendors/index.js';
import { getLogger } from '../../server/logging/index.js';

const logger = getLogger();

interface StoredModel {
  id: string;
  name: string;
  contextWindow: number;
  supportedModes: ('chat' | 'completion' | 'embedding')[];
}

interface StoredProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic';
  apiKeyEncrypted?: string;
  models: string[];
  modelCatalog?: StoredModel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ProviderRepository {
  private providersPath: string;

  constructor(customPath?: string) {
    const paths = customPath ? { providers: customPath } : getStoragePaths();
    this.providersPath = paths.providers;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.providersPath, { recursive: true });
  }

  private getFilePath(id: string): string {
    return resolveSafeJsonEntityPath(this.providersPath, id, 'provider id');
  }

  async list(): Promise<Provider[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.providersPath);
    const providers: Provider[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.providersPath, file), 'utf-8');
        const data = JSON.parse(content) as StoredProvider;
        providers.push(this.deserializeProvider(data));
      } catch (error) {
        logger.error('Failed to read provider file', error, { file });
      }
    }

    return providers.sort((a, b) => 
      (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
    );
  }

  async get(id: string): Promise<Provider | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.deserializeProvider(JSON.parse(content));
    } catch {
      return null;
    }
  }

  async create(data: {
    name: string;
    type: 'openai' | 'anthropic' | 'ollama' | 'custom';
    baseUrl?: string;
    protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic';
    apiKey?: string;
    models: string[];
    enabled: boolean;
  }): Promise<Provider> {
    await this.ensureDir();
    const now = new Date();
    const provider: Provider = {
      id: generateId(),
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl,
      protocol: data.protocol,
      apiKeyEncrypted: data.apiKey ? encryptProviderApiKey(data.apiKey) : undefined,
      models: data.models,
      enabled: data.enabled,
    };

    await fs.writeFile(
      this.getFilePath(provider.id),
      JSON.stringify(this.serializeProvider(provider, now), null, 2)
    );

    return provider;
  }

  async update(
    id: string, 
    data: Partial<{
      name: string;
      type: 'openai' | 'anthropic' | 'ollama' | 'custom';
      baseUrl: string | null;
      protocol: 'openai' | 'anthropic' | 'ollama' | 'generic';
      apiKey: string | null;
      models: string[];
      modelCatalog: Model[];
      enabled: boolean;
    }>
  ): Promise<Provider | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: Provider = {
      ...existing,
      name: data.name ?? existing.name,
      type: data.type ?? existing.type,
      baseUrl: data.baseUrl === null ? undefined : (data.baseUrl ?? existing.baseUrl),
      protocol: data.protocol ?? existing.protocol,
      apiKeyEncrypted: data.apiKey === null 
        ? undefined 
        : (data.apiKey ? encryptProviderApiKey(data.apiKey) : existing.apiKeyEncrypted),
      models: data.models ?? existing.models,
      modelCatalog: data.modelCatalog ?? existing.modelCatalog,
      enabled: data.enabled ?? existing.enabled,
    };

    await fs.writeFile(
      this.getFilePath(id),
      JSON.stringify(this.serializeProvider(updated, new Date()), null, 2)
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listModels(providerId: string): Promise<Model[]> {
    const provider = await this.get(providerId);
    if (!provider) return [];

    return this.getModelCatalog(provider);
  }

  async getModel(providerId: string, modelId: string): Promise<Model | null> {
    const models = await this.listModels(providerId);
    return models.find(m => m.id === modelId) ?? null;
  }

  async addCustomModel(
    providerId: string,
    model: { name: string; contextWindow: number; supportedModes: ('chat' | 'completion' | 'embedding')[] }
  ): Promise<Model | null> {
    const provider = await this.get(providerId);
    if (!provider) return null;

    const catalog = this.getModelCatalog(provider);
    const newModel: Model = {
      id: model.name,
      providerId,
      name: model.name,
      contextWindow: model.contextWindow,
      supportedModes: model.supportedModes,
    };

    const existingIndex = catalog.findIndex((item) => item.id === newModel.id);
    if (existingIndex === -1) {
      catalog.push(newModel);
    } else {
      catalog[existingIndex] = newModel;
    }

    if (!provider.models.includes(newModel.id)) {
      provider.models = [...provider.models, newModel.id];
    }

    provider.modelCatalog = catalog;
    await fs.writeFile(
      this.getFilePath(providerId),
      JSON.stringify(this.serializeProvider(provider, new Date()), null, 2)
    );

    return newModel;
  }

  async saveModelCatalog(providerId: string, models: Model[]): Promise<Provider | null> {
    const provider = await this.get(providerId);
    if (!provider) {
      return null;
    }

    provider.modelCatalog = models;

    await fs.writeFile(
      this.getFilePath(providerId),
      JSON.stringify(this.serializeProvider(provider, new Date()), null, 2)
    );

    return provider;
  }

  private getModelCatalog(provider: Provider): Model[] {
    const protocol = provider.protocol ?? detectProtocol(provider.type, provider.baseUrl);
    const vendor = resolveVendorConfig({
      type: provider.type,
      baseUrl: provider.baseUrl,
      name: provider.name,
    });
    if (provider.modelCatalog && provider.modelCatalog.length > 0) {
      return provider.modelCatalog.map((model) => ({
        ...model,
        contextWindow: this.resolveContextWindow(protocol, vendor?.defaultModelCatalog, model.id, model.contextWindow),
      }));
    }

    return provider.models.map((name) => ({
      id: name,
      providerId: provider.id,
      name,
      contextWindow: this.resolveContextWindow(protocol, vendor?.defaultModelCatalog, name),
      supportedModes: ['chat', 'completion'],
    }));
  }

  private resolveContextWindow(
    protocol: ProtocolType,
    vendorModelCatalog: Array<{ id: string; contextWindow: number }> | undefined,
    modelId: string,
    storedContextWindow?: number,
  ): number {
    const vendorContextWindow = vendorModelCatalog?.find((model) => model.id === modelId)?.contextWindow;

    if (storedContextWindow !== undefined) {
      if (vendorContextWindow !== undefined && storedContextWindow === this.defaultContextWindow(protocol)) {
        return vendorContextWindow;
      }
      return storedContextWindow;
    }

    return vendorContextWindow ?? this.defaultContextWindow(protocol);
  }

  private defaultContextWindow(protocol: ProtocolType): number {
    if (protocol === 'anthropic') {
      return 200000;
    }
    if (protocol === 'ollama') {
      return 32768;
    }
    return 4096;
  }

  private serializeProvider(provider: Provider, date: Date): StoredProvider {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      apiKeyEncrypted: provider.apiKeyEncrypted,
      models: provider.models,
      modelCatalog: provider.modelCatalog?.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        supportedModes: model.supportedModes,
      })),
      enabled: provider.enabled,
      createdAt: (provider.createdAt ?? date).toISOString(),
      updatedAt: date.toISOString(),
    };
  }

  private deserializeProvider(data: StoredProvider): Provider {
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl,
      protocol: data.protocol,
      apiKeyEncrypted: data.apiKeyEncrypted,
      models: data.models,
      modelCatalog: data.modelCatalog?.map((model) => ({
        id: model.id,
        providerId: data.id,
        name: model.name,
        contextWindow: model.contextWindow,
        supportedModes: model.supportedModes,
      })),
      enabled: data.enabled,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    } as Provider;
  }
}
