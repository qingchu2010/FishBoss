import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'

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

export type ModelStatus = 'alpha' | 'beta' | 'deprecated' | 'active'

export interface ModelCapabilities {
  temperature: boolean
  reasoning: boolean
  attachment: boolean
  toolcall: boolean
  streaming: boolean
  input: {
    text: boolean
    audio: boolean
    image: boolean
    video: boolean
    pdf: boolean
  }
  output: {
    text: boolean
    audio: boolean
    image: boolean
    video: boolean
    pdf: boolean
  }
}

export interface ModelCost {
  input: number
  output: number
  cache?: {
    read: number
    write: number
  }
}

export interface ModelLimit {
  context: number
  input?: number
  output: number
}

export interface Model {
  id: string
  name: string
  providerId: string
  apiId: string
  capabilities: ModelCapabilities
  cost: ModelCost
  limit: ModelLimit
  status: ModelStatus
  enabled: boolean
}

export interface ModelProvider {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  hasApiKey?: boolean
  models: Model[]
  selectedModels: string[]
  defaultModel: string | null
  enabled: boolean
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

export interface PresetProvider {
  name: string
  type: ProviderType
  baseUrl: string
  models: string[]
  selectedModels: string[]
  defaultModel: string | null
  envKey?: string
}

export const PRESET_PROVIDERS: PresetProvider[] = [
  {
    name: 'MiniMax API',
    type: 'minimax',
    baseUrl: 'https://api.minimaxi.com',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'MINIMAX_API_KEY'
  },
  {
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'OPENAI_API_KEY'
  },
  {
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'ANTHROPIC_API_KEY'
  },
  {
    name: 'Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'GOOGLE_API_KEY'
  },
  {
    name: 'DeepSeek',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'DEEPSEEK_API_KEY'
  },
  {
    name: 'Moonshot',
    type: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'MOONSHOT_API_KEY'
  },
  {
    name: 'ZhiPu',
    type: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [],
    selectedModels: [],
    defaultModel: null,
    envKey: 'ZHIPU_API_KEY'
  }
]

export const useModelProviderStore = defineStore('modelProviders', () => {
  const providers = ref<ModelProvider[]>([])
  const activeProviderId = ref<string | null>(null)
  const isLoading = ref(false)

  const activeProvider = computed(() => {
    return providers.value.find(p => p.id === activeProviderId.value)
  })

  async function loadFromApi() {
    isLoading.value = true
    try {
      const data = await api.getProviders()
      providers.value = data.providers || []
      activeProviderId.value = data.activeProviderId || null
    } catch (error) {
      console.error('Failed to load providers:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function saveToApi() {
    try {
      await api.saveProviders({
        providers: providers.value,
        activeProviderId: activeProviderId.value
      })
    } catch (error) {
      console.error('Failed to save providers:', error)
    }
  }

  function addPresetProvider(preset: PresetProvider) {
    const exists = providers.value.find(p => p.name === preset.name)
    if (exists) return exists

    const provider: ModelProvider = {
      id: Math.random().toString(36).substring(2),
      name: preset.name,
      type: preset.type,
      baseUrl: preset.baseUrl,
      apiKey: '',
      models: preset.models.map((id) => ({
        id,
        name: id,
        providerId: '',
        apiId: id,
        capabilities: getDefaultCapabilities(preset.type),
        cost: { input: 0, output: 0 },
        limit: { context: 4096, output: 2048 },
        status: 'active' as ModelStatus,
        enabled: true
      })),
      selectedModels: [],
      defaultModel: null,
      enabled: true
    }
    providers.value.push(provider)
    if (!activeProviderId.value) {
      activeProviderId.value = provider.id
    }
    saveToApi()
    return provider
  }

  function addCustomProvider(name: string, baseUrl: string) {
    const detectedType = detectProviderType(baseUrl)
    const provider: ModelProvider = {
      id: Math.random().toString(36).substring(2),
      name,
      type: detectedType,
      baseUrl,
      apiKey: '',
      models: [],
      selectedModels: [],
      defaultModel: null,
      enabled: true
    }
    providers.value.push(provider)
    if (!activeProviderId.value) {
      activeProviderId.value = provider.id
    }
    saveToApi()
    return provider
  }

  function toggleModel(providerId: string, model: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    const index = provider.selectedModels.indexOf(model)
    if (index === -1) {
      provider.selectedModels.push(model)
    } else {
      provider.selectedModels.splice(index, 1)
      if (provider.defaultModel === model) {
        provider.defaultModel = provider.selectedModels[0] || null
      }
    }
    saveToApi()
  }

  function removeModel(providerId: string, model: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    const index = provider.selectedModels.indexOf(model)
    if (index !== -1) {
      provider.selectedModels.splice(index, 1)
      if (provider.defaultModel === model) {
        provider.defaultModel = provider.selectedModels[0] || null
      }
      saveToApi()
    }
  }

  function setDefaultModel(providerId: string, model: string) {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) return
    provider.defaultModel = model
    saveToApi()
  }

  function removeProvider(id: string) {
    const index = providers.value.findIndex(p => p.id === id)
    if (index !== -1) {
      providers.value.splice(index, 1)
      if (activeProviderId.value === id) {
        activeProviderId.value = providers.value[0]?.id || null
      }
      saveToApi()
    }
  }

  function updateProvider(id: string, updates: Partial<ModelProvider>) {
    const provider = providers.value.find(p => p.id === id)
    if (provider) {
      Object.assign(provider, updates)
      saveToApi()
    }
  }

  function setActiveProvider(id: string) {
    activeProviderId.value = id
    saveToApi()
  }

  function detectProviderType(baseUrl: string): ProviderType {
    const url = baseUrl.toLowerCase()
    if (url.includes('minimax')) return 'minimax'
    if (url.includes('openai') || url.includes('azure')) return 'openai'
    if (url.includes('gemini') || url.includes('generativelanguage')) return 'gemini'
    if (url.includes('anthropic') || url.includes('claude')) return 'anthropic'
    if (url.includes('deepseek')) return 'deepseek'
    if (url.includes('moonshot')) return 'moonshot'
    if (url.includes('bigmodel') || url.includes('zhipu')) return 'zhipu'
    if (url.includes('baidu') || url.includes('baidubce')) return 'baidu'
    if (url.includes('aliyun') || url.includes('dashscope') || url.includes('alibaba')) return 'alibaba'
    return 'custom'
  }

  async function fetchModels(providerId: string): Promise<string[]> {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider || !provider.baseUrl) return []

    try {
      const result = await api.fetchModels(provider.type, provider.baseUrl)
      if (result.models) {
        const models: Model[] = result.models.map((modelId: string) => ({
          id: modelId,
          name: modelId,
          providerId,
          apiId: modelId,
          capabilities: getDefaultCapabilities(provider.type),
          cost: { input: 0, output: 0 },
          limit: { context: 4096, output: 2048 },
          status: 'active' as ModelStatus,
          enabled: true
        }))
        updateProvider(providerId, { models })
        return result.models
      }
      throw new Error(result.error || 'Failed to fetch models')
    } catch (error) {
      console.error('Failed to fetch models:', error)
      throw error
    }
  }

  async function testConnection(providerId: string): Promise<{ success: boolean; error?: string }> {
    const provider = providers.value.find(p => p.id === providerId)
    if (!provider) {
      return { success: false, error: 'Provider not found' }
    }
    if (!provider.baseUrl) {
      return { success: false, error: 'Base URL is required' }
    }

    return api.testConnection(provider.type, provider.baseUrl)
  }

  async function init() {
    await loadFromApi()
  }

  return {
    providers,
    activeProviderId,
    activeProvider,
    isLoading,
    presetProviders: PRESET_PROVIDERS,
    loadFromApi,
    addPresetProvider,
    addCustomProvider,
    removeProvider,
    updateProvider,
    setActiveProvider,
    detectProviderType,
    fetchModels,
    testConnection,
    toggleModel,
    removeModel,
    setDefaultModel,
    init
  }
})

function getDefaultCapabilities(type: ProviderType): ModelCapabilities {
  const base: ModelCapabilities = {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: true,
    streaming: true,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false
    }
  }

  switch (type) {
    case 'openai':
      return {
        ...base,
        attachment: true,
        input: { ...base.input, image: true, audio: true },
        output: { ...base.output, audio: true }
      }
    case 'anthropic':
      return {
        ...base,
        attachment: true,
        reasoning: true,
        input: { ...base.input, image: true, pdf: true }
      }
    case 'gemini':
      return {
        ...base,
        attachment: true,
        input: { ...base.input, image: true, video: true, audio: true, pdf: true }
      }
    case 'deepseek':
      return {
        ...base,
        reasoning: true
      }
    default:
      return base
  }
}
