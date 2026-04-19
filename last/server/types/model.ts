import type { ProviderType } from './provider.js'

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

export function getDefaultCapabilities(type: ProviderType): ModelCapabilities {
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
