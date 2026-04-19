import { del, get, post } from './http'

export interface Provider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'ollama' | 'custom'
  baseUrl?: string
  protocol?: 'openai' | 'anthropic' | 'ollama' | 'generic'
  apiKeyMasked: string
  models: string[]
  enabled: boolean
}

export interface ProviderModel {
  id: string
  providerId: string
  name: string
  contextWindow: number
  supportedModes: Array<'chat' | 'completion' | 'embedding'>
}

export interface CreateProviderData {
  name: string
  type: Provider['type']
  baseUrl?: string
  apiKey?: string
  models: string[]
  enabled: boolean
  defaultModels?: string[]
}

export interface UpdateProviderData {
  name?: string
  type?: Provider['type']
  baseUrl?: string | null
  apiKey?: string | null
  models?: string[]
  enabled?: boolean
}

export interface CustomModelData {
  name: string
  contextWindow?: number
  supportedModes?: Array<'chat' | 'completion' | 'embedding'>
}

export interface ProviderTestPayload {
  providerId: string
  model: string
}

export interface FetchModelsPayload {
  providerId: string
}

export interface FetchModelsResult {
  models: ProviderModel[]
  error?: string
}

export interface ProviderTestResult {
  success: boolean
  model: string
  response?: string
  error?: string
  latencyMs: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface PresetProvider {
  name: string
  type: Provider['type']
  protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'
  baseUrl?: string
  requiresApiKey: boolean
  models?: string[]
  supportsModelFetch?: boolean
}

export interface ProviderTypeMetadata {
  type: Provider['type']
  protocol: 'openai' | 'anthropic' | 'ollama' | 'generic'
  defaultBaseUrl?: string
  requiresApiKey: boolean
}

export const providersApi = {
  async list(): Promise<Provider[]> {
    const response = await get<{ providers: Provider[] }>('/providers')
    return response.providers
  },

  async get(id: string): Promise<Provider> {
    const response = await get<{ provider: Provider }>(`/providers/${id}`)
    return response.provider
  },

  async create(data: CreateProviderData): Promise<Provider> {
    const response = await post<{ provider: Provider }>('/providers', data)
    return response.provider
  },

  async update(id: string, data: UpdateProviderData): Promise<Provider> {
    const response = await post<{ provider: Provider }>(`/providers/${id}`, data, 'PATCH')
    return response.provider
  },

  async delete(id: string): Promise<void> {
    await del(`/providers/${id}`)
  },

  async listModels(id: string): Promise<ProviderModel[]> {
    const response = await get<{ models: ProviderModel[] }>(`/providers/${id}/models`)
    return response.models
  },

  async addCustomModel(id: string, data: CustomModelData): Promise<ProviderModel> {
    const response = await post<{ model: ProviderModel }>(`/providers/${id}/models`, data)
    return response.model
  },

  async testConnection(data: ProviderTestPayload): Promise<ProviderTestResult> {
    const response = await post<{ result: ProviderTestResult }>('/providers/test', data)
    return response.result
  },

  async fetchModels(data: FetchModelsPayload): Promise<FetchModelsResult> {
    return post<FetchModelsResult>('/providers/fetch-models', data)
  },

  async metadata(): Promise<{ types: ProviderTypeMetadata[]; presets: PresetProvider[] }> {
    return get<{ types: ProviderTypeMetadata[]; presets: PresetProvider[] }>('/providers/metadata')
  }
}
