import type {
  ProviderToolChoice,
  ProviderToolDefinition,
  StreamChunk,
} from '../../types/provider.js';
import { ConflictError } from '../../server/errors/index.js';
import { ProviderRepository } from './repository.js';
import {
  CreateProviderSchema,
  UpdateProviderSchema,
  CustomModelSchema,
  TestModelRequestSchema,
  FetchModelsRequestSchema,
  toProviderResponse,
  toModelResponse,
  decryptProviderApiKey,
  type ProviderResponse,
  type ModelResponse,
  type TestModelResponse,
  type FetchModelsResponse,
} from './schema.js';
import { createLLMClient, detectProtocol, type ProtocolType } from './protocols/index.js';
import { getVendorPresets, allVendors, resolveVendorConfig, type VendorConfig } from './vendors/index.js';
import { loadPrompt } from '../../prompts/repository.js';

export class ProviderService {
  private repository: ProviderRepository;

  constructor(repository?: ProviderRepository) {
    this.repository = repository ?? new ProviderRepository();
  }

  async list(): Promise<ProviderResponse[]> {
    const providers = await this.repository.list();
    return providers.map(toProviderResponse);
  }

  async listProviderMetadata(): Promise<{
    types: Array<{ type: 'openai' | 'anthropic' | 'ollama' | 'custom'; protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'; defaultBaseUrl?: string; requiresApiKey: boolean }>;
    presets: Array<{ name: string; type: 'openai' | 'anthropic' | 'ollama' | 'custom'; protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'; baseUrl?: string; requiresApiKey: boolean; models?: string[]; supportsModelFetch?: boolean }>;
  }> {
    const vendorPresets = getVendorPresets();
    
    return {
      types: [
        { type: 'openai', protocol: 'openai', defaultBaseUrl: 'https://api.openai.com', requiresApiKey: true },
        { type: 'anthropic', protocol: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', requiresApiKey: true },
        { type: 'ollama', protocol: 'ollama', defaultBaseUrl: 'http://localhost:11434', requiresApiKey: false },
        { type: 'custom', protocol: 'generic', requiresApiKey: false },
      ],
      presets: vendorPresets.map((v) => ({
        name: v.name,
        type: v.protocol === 'anthropic' ? 'anthropic' : v.protocol === 'ollama' ? 'ollama' : v.protocol === 'openai' ? 'openai' : 'custom',
        protocol: v.protocol,
        baseUrl: v.baseUrl,
        requiresApiKey: v.requiresApiKey,
        models: this.getVendorDefaultModels(v),
        supportsModelFetch: v.supportsModelFetch,
      })),
    };
  }

  async get(id: string): Promise<ProviderResponse | null> {
    const provider = await this.repository.get(id);
    return provider ? toProviderResponse(provider) : null;
  }

  async create(data: unknown): Promise<ProviderResponse> {
    const parsed = CreateProviderSchema.parse(data);
    const normalized = this.normalizeProviderEndpoint(parsed.type, parsed.baseUrl);
    const apiKey = parsed.apiKey?.trim() || undefined;
    const vendor = resolveVendorConfig({
      type: parsed.type,
      baseUrl: normalized.baseUrl,
      name: parsed.name,
    });
    const provider = await this.repository.create({
      name: parsed.name,
      type: parsed.type,
      baseUrl: normalized.baseUrl,
      protocol: normalized.protocol,
      apiKey,
      models: parsed.models,
      enabled: parsed.enabled,
    });
    
    const defaultModels = parsed.defaultModels ?? [];
    if (defaultModels.length > 0) {
      const protocol = vendor?.protocol ?? normalized.protocol;
      const modelRecords = defaultModels.map((modelId) => 
        this.toProviderModel(provider.id, modelId, protocol as ProtocolType, undefined, vendor)
      );
      await this.repository.saveModelCatalog(provider.id, modelRecords);
    }
    
    return toProviderResponse(provider);
  }

  async update(id: string, data: unknown): Promise<ProviderResponse | null> {
    const parsed = UpdateProviderSchema.parse(data);
    const existing = await this.repository.get(id);
    if (!existing) {
      return null;
    }

    const nextType = parsed.type ?? existing.type;
    const nextBaseUrlInput = parsed.baseUrl !== undefined
      ? parsed.baseUrl ?? undefined
      : parsed.type !== undefined
        ? undefined
        : existing.baseUrl;
    const normalized = this.normalizeProviderEndpoint(nextType, nextBaseUrlInput);
    const nextBaseUrl = parsed.baseUrl !== undefined || parsed.type !== undefined
      ? normalized.baseUrl
      : existing.baseUrl;
    const nextProtocol = parsed.baseUrl !== undefined || parsed.type !== undefined
      ? normalized.protocol
      : existing.protocol;
    const endpointChanged = nextBaseUrl !== existing.baseUrl || nextProtocol !== existing.protocol;
    const nextApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : parsed.apiKey;
    const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
    const wantsToClearApiKey = nextApiKey === null;

    if (endpointChanged && existing.apiKeyEncrypted && !hasNewApiKey && !wantsToClearApiKey) {
      throw new ConflictError('Changing the provider endpoint requires re-entering the API key or clearing it first');
    }
    
    const updateData: Parameters<typeof this.repository.update>[1] = {
      name: parsed.name,
      type: parsed.type,
      baseUrl: parsed.baseUrl === undefined && parsed.type === undefined ? undefined : nextBaseUrl ?? null,
      protocol: parsed.baseUrl === undefined && parsed.type === undefined ? undefined : nextProtocol,
      models: parsed.models,
      enabled: parsed.enabled,
    };

    if (wantsToClearApiKey) {
      updateData.apiKey = null;
    } else if (hasNewApiKey) {
      updateData.apiKey = nextApiKey;
    }

    const provider = await this.repository.update(id, updateData);
    return provider ? toProviderResponse(provider) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async listModels(providerId: string): Promise<ModelResponse[]> {
    const models = await this.repository.listModels(providerId);
    return models.map(toModelResponse);
  }

  async getModel(providerId: string, modelId: string): Promise<ModelResponse | null> {
    const model = await this.repository.getModel(providerId, modelId);
    return model ? toModelResponse(model) : null;
  }

  async addCustomModel(
    providerId: string,
    data: unknown
  ): Promise<ModelResponse | null> {
    const parsed = CustomModelSchema.parse(data);
    const provider = await this.repository.get(providerId);
    if (!provider) {
      return null;
    }
    const protocol = provider.protocol ?? detectProtocol(provider.type, provider.baseUrl);
    const model = await this.repository.addCustomModel(providerId, {
      name: parsed.name,
      contextWindow: parsed.contextWindow ?? this.defaultContextWindow(protocol),
      supportedModes: parsed.supportedModes ?? this.defaultSupportedModes(protocol),
    });
    return model ? toModelResponse(model) : null;
  }

  async testModel(data: unknown): Promise<TestModelResponse> {
    const parsed = TestModelRequestSchema.parse(data);
    const startTime = Date.now();
    
    try {
      const provider = await this.repository.get(parsed.providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      if (!provider.enabled) {
        throw new Error('Provider is disabled');
      }

      const baseUrl = provider.baseUrl;
      if (!baseUrl) {
        throw new Error('Base URL is required');
      }

      const protocol = provider.protocol ?? detectProtocol(provider.type, baseUrl);
      
      let apiKey: string | undefined;
      if (provider.apiKeyEncrypted) {
        apiKey = decryptProviderApiKey(provider.apiKeyEncrypted);
      }

      const client = createLLMClient(protocol as ProtocolType, {
        baseUrl,
        apiKey,
      });

      const testMessage = await loadPrompt('model-test');
      const result = await client.testConnection(parsed.model, testMessage ?? undefined);

      return {
        success: result.success,
        model: parsed.model,
        response: result.success ? `Successfully connected to ${parsed.model}` : undefined,
        error: result.error,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      return {
        success: false,
        model: parsed.model,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  async fetchModels(data: unknown): Promise<FetchModelsResponse> {
    const parsed = FetchModelsRequestSchema.parse(data);
    
    try {
      const provider = await this.repository.get(parsed.providerId);
      if (!provider) {
        return { models: [], error: 'Provider not found' };
      }

      const baseUrl = provider.baseUrl;
      if (!baseUrl) {
        return { models: [], error: 'Base URL is required' };
      }

      const vendor = resolveVendorConfig({
        type: provider.type,
        baseUrl,
        name: provider.name,
      });
      if (vendor && vendor.supportsModelFetch === false && this.getVendorDefaultModels(vendor).length > 0) {
        const discoveredModels = this.getVendorDefaultModels(vendor).map((modelId) =>
          this.toProviderModel(
            provider.id,
            modelId,
            vendor.protocol as ProtocolType,
            undefined,
            vendor,
          )
        );
        const existingModels = await this.repository.listModels(provider.id);
        const mergedModels = this.mergeModels(existingModels, discoveredModels);
        await this.repository.saveModelCatalog(provider.id, mergedModels);
        return { models: mergedModels.map(toModelResponse) };
      }

      const protocol = provider.protocol ?? detectProtocol(provider.type, baseUrl);
      
      let apiKey: string | undefined;
      if (provider.apiKeyEncrypted) {
        try {
          apiKey = decryptProviderApiKey(provider.apiKeyEncrypted);
        } catch {
          return { models: [], error: 'Failed to decrypt API key' };
        }
      }

      const client = createLLMClient(protocol as ProtocolType, {
        baseUrl,
        apiKey,
      });

      const modelInfos = await client.fetchModels();
      const discoveredModels = modelInfos.map((modelInfo) => this.toProviderModel(
        provider.id,
        modelInfo.id,
        protocol as ProtocolType,
        modelInfo.contextWindow,
        vendor,
      ));
      const existingModels = await this.repository.listModels(provider.id);
      const mergedModels = this.mergeModels(existingModels, discoveredModels);

      await this.repository.saveModelCatalog(provider.id, mergedModels);

      return { models: mergedModels.map(toModelResponse) };
    } catch (err) {
      return { 
        models: [], 
        error: err instanceof Error ? err.message : String(err) 
      };
    }
  }

  async stream(
    providerId: string,
    model: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: StreamChunk) => void,
    tools?: ProviderToolDefinition[],
    toolChoice?: ProviderToolChoice,
    signal?: AbortSignal
  ): Promise<void> {
    const provider = await this.repository.get(providerId);
    if (!provider) throw new Error('Provider not found');
    if (!provider.enabled) throw new Error('Provider is disabled');

    const baseUrl = provider.baseUrl;
    if (!baseUrl) throw new Error('Base URL is required');

    const protocol = provider.protocol ?? detectProtocol(provider.type, baseUrl);
    
    let apiKey: string | undefined;
    if (provider.apiKeyEncrypted) {
      apiKey = decryptProviderApiKey(provider.apiKeyEncrypted);
    }

    const client = createLLMClient(protocol as ProtocolType, {
      baseUrl,
      apiKey,
    });

    await client.streamChat(
      {
        model,
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        tools,
        toolChoice,
        signal,
      },
      onChunk
    );
  }

  private normalizeProviderEndpoint(
    type: 'openai' | 'anthropic' | 'ollama' | 'custom' | undefined,
    inputBaseUrl: string | null | undefined
  ): { baseUrl?: string; protocol: 'openai' | 'anthropic' | 'ollama' | 'generic' } {
    const protocol = detectProtocol(type, inputBaseUrl ?? undefined);

    if (!inputBaseUrl) {
      return {
        baseUrl: this.defaultBaseUrl(protocol),
        protocol,
      };
    }

    return {
      baseUrl: inputBaseUrl.trim().replace(/\/+$/, ''),
      protocol,
    };
  }

  private defaultBaseUrl(protocol: ProtocolType): string | undefined {
    const vendor = allVendors.find((v) => v.protocol === protocol);
    return vendor?.baseUrl;
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

  private getVendorDefaultModels(vendor?: VendorConfig): string[] {
    if (!vendor) {
      return [];
    }
    return vendor.defaultModels ?? vendor.defaultModelCatalog?.map((model) => model.id) ?? [];
  }

  private getVendorModelContextWindow(vendor: VendorConfig | undefined, modelId: string): number | undefined {
    return vendor?.defaultModelCatalog?.find((model) => model.id === modelId)?.contextWindow;
  }

  private defaultSupportedModes(protocol: ProtocolType): ('chat' | 'completion' | 'embedding')[] {
    if (protocol === 'ollama') {
      return ['chat', 'completion'];
    }
    return ['chat', 'completion'];
  }

  private toProviderModel(
    providerId: string,
    modelId: string,
    protocol: ProtocolType,
    contextWindow?: number,
    vendor?: VendorConfig,
  ): import('../../types/provider.js').Model {
    return {
      id: modelId,
      providerId,
      name: modelId,
      contextWindow: contextWindow ?? this.getVendorModelContextWindow(vendor, modelId) ?? this.defaultContextWindow(protocol),
      supportedModes: this.defaultSupportedModes(protocol),
    };
  }

  private mergeModels(existing: import('../../types/provider.js').Model[], discovered: import('../../types/provider.js').Model[]): import('../../types/provider.js').Model[] {
    const merged = new Map<string, import('../../types/provider.js').Model>();

    for (const model of existing) {
      merged.set(model.id, model);
    }

    for (const model of discovered) {
      const current = merged.get(model.id);
      merged.set(model.id, current ? { ...current, ...model } : model);
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
