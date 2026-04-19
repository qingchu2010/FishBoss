import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProvidersStore } from './providers'
import { providersApi } from '@/services/providers'

vi.mock('@/services/providers', () => ({
  providersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listModels: vi.fn(),
    addCustomModel: vi.fn(),
    testConnection: vi.fn(),
    fetchModels: vi.fn(),
    metadata: vi.fn()
  }
}))

describe('providers store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('keeps backend model metadata instead of fabricating defaults on fetch', async () => {
    vi.mocked(providersApi.list).mockResolvedValue([
      {
        id: 'provider_1',
        name: 'Anthropic',
        type: 'anthropic',
        apiKeyMasked: '',
        models: [],
        enabled: true
      }
    ])
    vi.mocked(providersApi.fetchModels).mockResolvedValue({
      models: [
        {
          id: 'claude-sonnet-4-20250514',
          providerId: 'provider_1',
          name: 'claude-sonnet-4-20250514',
          contextWindow: 200000,
          supportedModes: ['chat', 'completion']
        }
      ]
    })

    const store = useProvidersStore()
    await store.fetchProviders()
    const result = await store.fetchModels('provider_1')

    expect(result.models[0]?.contextWindow).toBe(200000)
    expect(store.providerModels['provider_1']?.[0]?.contextWindow).toBe(200000)
    expect(store.providers[0]?.models).toEqual([])
  })
})
