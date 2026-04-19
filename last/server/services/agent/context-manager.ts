import axios from 'axios'
import { readConfigFile, getProviderApiKey } from '../../storage/index.js'
import type { ProviderConfig, ChatMessage } from '../../types/index.js'

import { getProviderHeaders, getChatEndpoint } from '../../utils/provider.js'
import { buildRequestBody, parseResponse } from '../../provider/index.js'

export class ContextManager {
  private contextLimit: number

  constructor(contextLimit: number = 128000) {
    this.contextLimit = contextLimit
  }

  countTokens(text: string): number {
    if (!text) return 0
    let count = 0
    for (const char of text) {
      if (char.charCodeAt(0) > 127) {
        count += 2
      } else {
        count += 0.25
      }
    }
    return Math.ceil(count)
  }

  countMessages(messages: ChatMessage[]): number {
    let total = 0
    for (const msg of messages) {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content)
      total += this.countTokens(content)
      if (msg.tool_calls) {
        total += this.countTokens(JSON.stringify(msg.tool_calls))
      }
    }
    return total
  }

  shouldCompress(messages: ChatMessage[]): boolean {
    const used = this.countMessages(messages)
    const threshold = this.contextLimit * 0.7
    return used >= threshold
  }

  async compressMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const systemMessage = messages.find(m => m.role === 'system')
    const recentMessages = messages.slice(-10)
    const toolMessages = messages.filter(m => m.role === 'tool')
    const compressedMessage = messages.find(m => 
      m.role === 'assistant' && 
      typeof m.content === 'string' && 
      m.content.includes('[COMPRESSED]')
    )

    const oldMessages = messages.filter(m => {
      if (m.role === 'system') return false
      if (m.role === 'tool') return false
      if (m === compressedMessage) return false
      if (recentMessages.includes(m)) return false
      return true
    })

    if (oldMessages.length === 0) {
      return messages
    }

    const summary = await this.summarizeMessages(oldMessages)
    
    const compressed: ChatMessage[] = []
    
    if (systemMessage) {
      compressed.push(systemMessage)
    }
    
    compressed.push({
      role: 'assistant',
      content: `[COMPRESSED] Previous conversation summarized: ${summary}`
    })
    
    compressed.push(...recentMessages)
    compressed.push(...toolMessages)

    console.log(`[ContextManager] Compressed ${oldMessages.length} messages into summary of ${this.countTokens(summary)} tokens`)
    
    return compressed
  }

  private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
    const provider = await this.findAvailableProvider()
    if (!provider) {
      console.log('[ContextManager] No provider available for compression, keeping original messages')
      return messages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')
    }

    const summarizePrompt = this.buildSummarizePrompt(messages)
    
    try {
      const response = await this.callChatAPI(provider, summarizePrompt)
      return response
    } catch (error) {
      console.error('[ContextManager] Compression failed:', error)
      return messages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')
    }
  }

  private buildSummarizePrompt(messages: ChatMessage[]): ChatMessage[] {
    const conversationText = messages.map(m => {
      const content = typeof m.content === 'string' 
        ? m.content 
        : JSON.stringify(m.content)
      return `[${m.role}] ${content}`
    }).join('\n\n')

    return [
      {
        role: 'user',
        content: `Please summarize the following conversation concisely, preserving all important information, decisions, and context:\n\n${conversationText}\n\nProvide a concise summary that captures the key points.`
      }
    ]
  }

  private async findProvider(providerId?: string, modelId?: string): Promise<(ProviderConfig & { apiKey: string }) | null> {
    const config = readConfigFile('providers.json')
    if (!config?.providers) return null

    let provider: ProviderConfig | undefined
    if (providerId) {
      provider = config.providers.find((p: ProviderConfig) => p.id === providerId)
    } else if (modelId) {
      provider = config.providers.find((p: ProviderConfig) => 
        p.selectedModels?.includes(modelId) || 
        p.models?.some((m) => m.id === modelId || m.apiId === modelId)
      )
    }

    if (!provider) return null

    const apiKey = await getProviderApiKey(provider.id)
    if (!apiKey) return null

    return { ...provider, apiKey }
  }

  private async findAvailableProvider(): Promise<(ProviderConfig & { apiKey: string }) | null> {
    const config = readConfigFile('providers.json')
    if (!config?.providers) return null

    for (const provider of config.providers) {
      if (!provider.enabled) continue
      const apiKey = await getProviderApiKey(provider.id)
      if (apiKey) {
        return { ...provider, apiKey }
      }
    }

    return null
  }

  private async callChatAPI(provider: ProviderConfig & { apiKey: string }, messages: ChatMessage[]): Promise<string> {
    const { type, apiKey } = provider
    const endpoint = getChatEndpoint(provider, provider.selectedModels?.[0] || provider.defaultModel || '')
    
    const requestBody = buildRequestBody(
      type,
      provider.selectedModels?.[0] || provider.defaultModel || '',
      messages,
      undefined,
      false,
      false
    )

    const headers = getProviderHeaders(provider)
    if (type === 'gemini') {
      delete headers['Authorization']
    }

    const geminiEndpoint = type === 'gemini' 
      ? `${endpoint}?key=${apiKey}` 
      : endpoint

    const response = await axios.post(geminiEndpoint, requestBody, {
      headers,
      timeout: 60000
    })

    const parsed = parseResponse(type, response.data)
    return parsed.content
  }
}