import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { providersApi, type Provider, type ProviderModel, type CreateProviderData, type UpdateProviderData, type ProviderTestResult, type CustomModelData } from '@/services/providers'

export { type Provider, type ProviderModel }

export const useProvidersStore = defineStore('providers', () => {
  const providers = ref<Provider[]>([])
  const activeProviderId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const providerModels = ref<Record<string, ProviderModel[]>>({})

  const activeProvider = computed(() => {
    return providers.value.find((provider) => provider.id === activeProviderId.value) ?? null
  })

  async function fetchProviders(force = false) {
    if (!force && providers.value.length > 0) {
      return providers.value
    }
    isLoading.value = true
    error.value = null
    try {
      providers.value = await providersApi.list()
      if (!activeProviderId.value && providers.value.length > 0) {
        activeProviderId.value = providers.value[0].id
      }
      return providers.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch providers'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function setActiveProvider(id: string) {
    activeProviderId.value = id
  }

  async function createProvider(data: CreateProviderData) {
    const provider = await providersApi.create(data)
    providers.value.push(provider)
    activeProviderId.value = provider.id
    return provider
  }

  async function updateProvider(id: string, data: UpdateProviderData) {
    const provider = await providersApi.update(id, data)
    const index = providers.value.findIndex((item) => item.id === id)
    if (index !== -1) {
      providers.value[index] = provider
    }
    return provider
  }

  async function deleteProvider(id: string) {
    await providersApi.delete(id)
    providers.value = providers.value.filter((provider) => provider.id !== id)
    if (activeProviderId.value === id) {
      activeProviderId.value = providers.value[0]?.id ?? null
    }
    delete providerModels.value[id]
  }

  async function fetchModels(id: string) {
    const result = await providersApi.fetchModels({ providerId: id })
    providerModels.value = {
      ...providerModels.value,
      [id]: result.models
    }
    return result
  }

  async function loadModels(id: string) {
    const models = await providersApi.listModels(id)
    providerModels.value = {
      ...providerModels.value,
      [id]: models
    }
    return models
  }

  async function addCustomModel(id: string, data: CustomModelData) {
    const model = await providersApi.addCustomModel(id, data)
    providerModels.value = {
      ...providerModels.value,
      [id]: [...(providerModels.value[id] ?? []), model]
    }
    return model
  }

  async function testProvider(payload: Parameters<typeof providersApi.testConnection>[0]): Promise<ProviderTestResult> {
    return providersApi.testConnection(payload)
  }

  return {
    providers,
    activeProviderId,
    activeProvider,
    isLoading,
    error,
    providerModels,
    fetchProviders,
    setActiveProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    loadModels,
    fetchModels,
    addCustomModel,
    testProvider
  }
})
