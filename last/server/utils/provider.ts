import type { ProviderConfig, ProviderType } from '../types/index.js'
import { PROVIDER_INFO } from '../types/index.js'

export function getProviderHeaders(provider: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  const info = PROVIDER_INFO[provider.type]
  
  switch (provider.type) {
    case 'anthropic':
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'gemini':
      break
    default:
      headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  if (info?.defaultHeaders) {
    Object.assign(headers, info.defaultHeaders)
  }

  if (provider.headers) {
    Object.assign(headers, provider.headers)
  }

  return headers
}

export function getChatEndpoint(provider: ProviderConfig, modelId: string): string {
  const { baseUrl, type } = provider

  switch (type) {
    case 'openai':
    case 'deepseek':
    case 'moonshot':
    case 'zhipu':
    case 'custom':
      return `${baseUrl}/chat/completions`
    case 'anthropic':
      return `${baseUrl}/v1/messages`
    case 'gemini':
      return `${baseUrl}/v1beta/models/${modelId}:generateContent`
    case 'minimax':
      return `${baseUrl}/v1/text/chatcompletion_v2`
    case 'alibaba':
      return `${baseUrl}/services/aigc/text-generation/generation`
    case 'baidu':
      return `${baseUrl}/chat/${modelId}`
    default:
      return `${baseUrl}/chat/completions`
  }
}

export function getStreamEndpoint(provider: ProviderConfig, modelId: string): string {
  const { baseUrl, type } = provider

  switch (type) {
    case 'openai':
    case 'deepseek':
    case 'moonshot':
    case 'zhipu':
    case 'custom':
      return `${baseUrl}/chat/completions`
    case 'anthropic':
      return `${baseUrl}/v1/messages`
    case 'gemini':
      return `${baseUrl}/v1beta/models/${modelId}:streamGenerateContent?alt=sse`
    case 'minimax':
      return `${baseUrl}/v1/text/chatcompletion_v2`
    case 'alibaba':
      return `${baseUrl}/services/aigc/text-generation/generation`
    case 'baidu':
      return `${baseUrl}/chat/${modelId}`
    default:
      return `${baseUrl}/chat/completions`
  }
}
