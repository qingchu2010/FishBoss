import type { ProviderType } from './provider.js'
import type { Model } from './model.js'

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  models: Model[]
  selectedModels: string[]
  defaultModel: string | null
  enabled: boolean
  headers?: Record<string, string>
  options?: Record<string, unknown>
}
