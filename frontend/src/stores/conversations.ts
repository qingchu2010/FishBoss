import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  conversationsApi,
  type Conversation,
  type ConversationMessage,
  type ConversationToolCall
} from '@/services/conversations'

export type Message = ConversationMessage
export type { Conversation }

export const useConversationsStore = defineStore('conversations', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const streamingConversationId = ref<string | null>(null)
  const error = ref<string | null>(null)
  const activeStream = ref<AbortController | null>(null)
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const thinkingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function buildConversationTitle(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return 'New Conversation'
    }
    return normalized.slice(0, 80)
  }

  function clearTypingTimer(messageId: string) {
    const timer = typingTimers.get(messageId)
    if (!timer) return
    clearTimeout(timer)
    typingTimers.delete(messageId)
  }

  function clearAllTypingTimers() {
    for (const timer of typingTimers.values()) {
      clearTimeout(timer)
    }
    typingTimers.clear()
  }

  function clearThinkingTimer(messageId: string) {
    const timer = thinkingTimers.get(messageId)
    if (!timer) return
    clearTimeout(timer)
    thinkingTimers.delete(messageId)
  }

  function clearAllThinkingTimers() {
    for (const timer of thinkingTimers.values()) {
      clearTimeout(timer)
    }
    thinkingTimers.clear()
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function stringifyToolPayload(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }
    if (value === undefined) {
      return ''
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function normalizeToolCall(toolCall: unknown): ConversationToolCall | null {
    if (!isRecord(toolCall)) {
      return null
    }

    const id = typeof toolCall.id === 'string' ? toolCall.id : ''
    if (!id) {
      return null
    }

    if (isRecord(toolCall.function)) {
      const toolName = typeof toolCall.function.name === 'string' ? toolCall.function.name : ''
      if (!toolName) {
        return null
      }
      return {
        id,
        function: {
          name: toolName,
          arguments: typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments : ''
        },
        status: toolCall.status === 'pending' || toolCall.status === 'running' || toolCall.status === 'completed' || toolCall.status === 'error'
          ? toolCall.status
          : undefined,
        result: typeof toolCall.result === 'string' ? toolCall.result : undefined
      }
    }

    const toolName = typeof toolCall.name === 'string' ? toolCall.name : ''
    if (!toolName) {
      return null
    }

    const hasOutput = 'output' in toolCall && toolCall.output !== undefined
    const hasError = typeof toolCall.error === 'string' && toolCall.error.length > 0
    const errorText = typeof toolCall.error === 'string' ? toolCall.error : undefined

    return {
      id,
      function: {
        name: toolName,
        arguments: stringifyToolPayload(toolCall.input ?? {})
      },
      status: hasError ? 'error' : hasOutput ? 'completed' : 'running',
      result: hasError ? errorText : hasOutput ? stringifyToolPayload(toolCall.output) : undefined
    }
  }

  function normalizeToolCalls(toolCalls: unknown): ConversationToolCall[] | undefined {
    if (!Array.isArray(toolCalls)) {
      return undefined
    }
    const normalized = toolCalls
      .map(normalizeToolCall)
      .filter((toolCall): toolCall is ConversationToolCall => toolCall !== null)
    return normalized.length > 0 ? normalized : undefined
  }

  function upsertToolCall(message: ConversationMessage, nextToolCall: ConversationToolCall) {
    const existing = message.toolCalls ?? []
    const index = existing.findIndex((toolCall) => toolCall.id === nextToolCall.id)
    if (index === -1) {
      message.toolCalls = [...existing, nextToolCall]
      return
    }
    message.toolCalls = existing.map((toolCall, toolIndex) => toolIndex === index ? {
      ...toolCall,
      ...nextToolCall,
      function: nextToolCall.function
    } : toolCall)
  }

  function normalizeMessage(message: ConversationMessage): ConversationMessage {
    if (message.role === 'assistant') {
      return {
        ...message,
        displayContent: message.content,
        displayThinking: message.metadata?.thinking as string | undefined,
        toolCalls: normalizeToolCalls(message.toolCalls)
      }
    }
    return message
  }

  function startTypingEffect(message: Message) {
    if (message.role !== 'assistant') return
    const target = message.content ?? ''
    const displayed = message.displayContent ?? ''

    if (displayed.length >= target.length) {
      message.displayContent = target
      clearTypingTimer(message.id)
      return
    }

    if (typingTimers.has(message.id)) {
      return
    }

    const step = () => {
      const nextTarget = message.content ?? ''
      const nextDisplayed = message.displayContent ?? ''
      const remainingLength = nextTarget.length - nextDisplayed.length

      if (remainingLength <= 0) {
        message.displayContent = nextTarget
        clearTypingTimer(message.id)
        return
      }

      const charactersPerStep =
        remainingLength > 240 ? 6
          : remainingLength > 120 ? 4
            : remainingLength > 60 ? 3
              : remainingLength > 24 ? 2
                : 1

      const delay = 16

      message.displayContent = nextTarget.slice(0, nextDisplayed.length + charactersPerStep)
      const timer = setTimeout(step, delay)
      typingTimers.set(message.id, timer)
    }

    const timer = setTimeout(step, 0)
    typingTimers.set(message.id, timer)
  }

  function startThinkingEffect(message: Message) {
    if (message.role !== 'assistant') return
    const target = message.metadata?.thinking as string | undefined ?? ''
    const displayed = message.displayThinking ?? ''

    if (displayed.length >= target.length) {
      message.displayThinking = target
      clearThinkingTimer(message.id)
      return
    }

    if (thinkingTimers.has(message.id)) {
      return
    }

    const step = () => {
      const nextTarget = message.metadata?.thinking as string | undefined ?? ''
      const nextDisplayed = message.displayThinking ?? ''
      const remainingLength = nextTarget.length - nextDisplayed.length

      if (remainingLength <= 0) {
        message.displayThinking = nextTarget
        clearThinkingTimer(message.id)
        return
      }

      const charactersPerStep =
        remainingLength > 240 ? 6
          : remainingLength > 120 ? 4
            : remainingLength > 60 ? 3
              : remainingLength > 24 ? 2
                : 1

      const delay = 16

      message.displayThinking = nextTarget.slice(0, nextDisplayed.length + charactersPerStep)
      const timer = setTimeout(step, delay)
      thinkingTimers.set(message.id, timer)
    }

    const timer = setTimeout(step, 0)
    thinkingTimers.set(message.id, timer)
  }

  async function fetchConversations(force = false) {
    if (!force && conversations.value.length > 0) {
      return conversations.value
    }
    isLoading.value = true
    error.value = null
    try {
      conversations.value = await conversationsApi.list()
      return conversations.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch conversations'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchConversation(id: string) {
    isLoading.value = true
    error.value = null
    try {
      clearAllTypingTimers()
      clearAllThinkingTimers()
      const conversation = await conversationsApi.get(id)
      conversation.messages = (await conversationsApi.listMessages(id)).map(normalizeMessage)
      currentConversation.value = conversation
      return conversation
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch conversation'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function createConversation(data?: { title?: string; metadata?: Conversation['metadata'] }) {
    isLoading.value = true
    error.value = null
    try {
      clearAllTypingTimers()
      clearAllThinkingTimers()
      const conversation = await conversationsApi.create(data ?? {})
      conversation.messages = []
      conversations.value.unshift(conversation)
      currentConversation.value = conversation
      return conversation
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create conversation'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function deleteConversation(id: string) {
    isLoading.value = true
    error.value = null
    try {
      clearAllTypingTimers()
      clearAllThinkingTimers()
      await conversationsApi.remove(id)
      conversations.value = conversations.value.filter((conversation) => conversation.id !== id)
      if (currentConversation.value?.id === id) {
        currentConversation.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete conversation'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function openNewConversation() {
    activeStream.value?.abort()
    activeStream.value = null
    clearAllTypingTimers()
    clearAllThinkingTimers()
    currentConversation.value = null
    error.value = null
    isStreaming.value = false
    streamingConversationId.value = null
  }

  async function syncConversationTitle(id: string, title: string, metadata?: Conversation['metadata']) {
    const updatedConversation = await conversationsApi.update(id, { title, metadata })
    const index = conversations.value.findIndex((conversation) => conversation.id === id)
    if (index >= 0) {
      conversations.value[index] = {
        ...conversations.value[index],
        ...updatedConversation
      }
    }
    if (currentConversation.value?.id === id) {
      currentConversation.value = {
        ...currentConversation.value,
        ...updatedConversation,
        messages: currentConversation.value.messages
      }
    }
    return updatedConversation
  }

  async function sendMessage(message: string, options?: { agentId?: string; model?: string; provider?: string; tools?: string[] }) {
    let conversation = currentConversation.value
    const nextMetadata: Conversation['metadata'] = {
      agentId: options?.agentId,
      providerId: options?.provider,
      modelId: options?.model
    }

    if (!conversation) {
      conversation = await createConversation({
        title: buildConversationTitle(message),
        metadata: nextMetadata
      })
    } else if ((conversation.messages?.length ?? 0) === 0) {
      const nextTitle = buildConversationTitle(message)
      const mergedMetadata = {
        ...conversation.metadata,
        ...nextMetadata
      }
      if (
        conversation.title !== nextTitle ||
        conversation.metadata?.agentId !== mergedMetadata.agentId ||
        conversation.metadata?.providerId !== mergedMetadata.providerId ||
        conversation.metadata?.modelId !== mergedMetadata.modelId
      ) {
        await syncConversationTitle(conversation.id, nextTitle, mergedMetadata)
        conversation = currentConversation.value
      }
    }

    if (!conversation) return
    const conversationId = conversation.id

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString()
    }

    const placeholderAssistant: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      displayContent: '',
      displayThinking: '',
      createdAt: new Date().toISOString()
    }

    conversation.messages = [...(conversation.messages ?? []), userMessage, placeholderAssistant]
    isStreaming.value = true
    streamingConversationId.value = conversationId
    error.value = null

    const placeholderId = placeholderAssistant.id

    activeStream.value = conversationsApi.stream(
      conversationId,
      {
        message,
        model: options?.model,
        provider: options?.provider,
        tools: options?.tools
      },
      {
        onStart: (payload) => {
          if (currentConversation.value?.id !== conversationId) return
          if (typeof payload.messageId !== 'string') return
          const messages = currentConversation.value.messages
          if (!messages) return
          const placeholder = messages.find((item) => item.id === placeholderId)
          if (placeholder) {
            placeholder.id = payload.messageId
          }
        },
        onChunk: (payload) => {
          if (currentConversation.value?.id !== conversationId) return
          const messages = currentConversation.value.messages
          if (!messages) return
          const assistantId = typeof payload.messageId === 'string' ? payload.messageId : placeholderId
          const assistantMessage = messages.find((item) => item.id === assistantId || item.id === placeholderId)
          const hasThinkingUpdate = isRecord(payload.metadata) && 'thinking' in payload.metadata
          if (assistantMessage && assistantMessage.role === 'assistant' && (typeof payload.content === 'string' || hasThinkingUpdate)) {
            if (assistantMessage.id !== assistantId) {
              clearTypingTimer(assistantMessage.id)
              clearThinkingTimer(assistantMessage.id)
            }
            assistantMessage.id = assistantId
            const hasAnswerPayload = typeof payload.content === 'string' && payload.content.trim().length > 0
            if (typeof payload.content === 'string') {
              assistantMessage.content = payload.content
              assistantMessage.displayContent = assistantMessage.displayContent ?? ''
              startTypingEffect(assistantMessage)
            }
            if (isRecord(payload.metadata)) {
              assistantMessage.metadata = {
                ...(assistantMessage.metadata ?? {}),
                ...payload.metadata
              }
              if (hasThinkingUpdate) {
                if (hasAnswerPayload) {
                  clearThinkingTimer(assistantMessage.id)
                  assistantMessage.displayThinking = (assistantMessage.metadata?.thinking as string) ?? ''
                } else {
                  assistantMessage.displayThinking = assistantMessage.displayThinking ?? ''
                  startThinkingEffect(assistantMessage)
                }
              }
            }
          }
        },
        onToolEvent: (payload) => {
          if (currentConversation.value?.id !== conversationId) return
          const messages = currentConversation.value.messages
          if (!messages) return
          const assistantId = typeof payload.messageId === 'string' ? payload.messageId : placeholderId
          const assistantMessage = messages.find((item) => item.id === assistantId || item.id === placeholderId)
          if (!assistantMessage || assistantMessage.role !== 'assistant') {
            return
          }

          assistantMessage.id = assistantId

          const callId = typeof payload.callId === 'string' ? payload.callId : ''
          const toolName = typeof payload.toolName === 'string' ? payload.toolName : ''
          if (!callId || !toolName) {
            return
          }

          const nextToolCall: ConversationToolCall = {
            id: callId,
            function: {
              name: toolName,
              arguments: stringifyToolPayload(payload.input ?? {})
            },
            status: 'output' in payload || 'error' in payload
              ? (typeof payload.error === 'string' && payload.error ? 'error' : 'completed')
              : 'running',
            result: typeof payload.error === 'string' && payload.error
              ? payload.error
              : 'output' in payload && payload.output !== undefined
                ? stringifyToolPayload(payload.output)
                : undefined
          }

          upsertToolCall(assistantMessage, nextToolCall)
        },
        onComplete: async (payload) => {
          if (currentConversation.value?.id === conversationId) {
            const messages = currentConversation.value.messages
            const assistantId = typeof payload.messageId === 'string' ? payload.messageId : placeholderId
            const assistantMessage = messages?.find((item) => item.id === assistantId || item.id === placeholderId)
            if (assistantMessage && assistantMessage.role === 'assistant') {
              assistantMessage.id = assistantId
              if (typeof payload.content === 'string') {
                assistantMessage.content = payload.content
              }
              if (isRecord(payload.metadata)) {
                assistantMessage.metadata = {
                  ...(assistantMessage.metadata ?? {}),
                  ...payload.metadata
                }
              }
              if (Array.isArray(payload.toolCalls)) {
                assistantMessage.toolCalls = normalizeToolCalls(payload.toolCalls)
              }
              assistantMessage.displayContent = assistantMessage.displayContent ?? ''
              startTypingEffect(assistantMessage)
              if (isRecord(payload.metadata) && 'thinking' in payload.metadata) {
                clearThinkingTimer(assistantMessage.id)
                assistantMessage.displayThinking = (assistantMessage.metadata?.thinking as string) ?? ''
              }
            }
          }
          isStreaming.value = false
          streamingConversationId.value = null
          activeStream.value = null
          await fetchConversations(true)
        },
        onErrorEvent: (payload) => {
          if (currentConversation.value?.id !== conversationId) return
          if (typeof payload.messageId !== 'string') return
          const messages = currentConversation.value.messages
          if (!messages) return
          const assistantMessage = messages.find((item) => item.id === payload.messageId || item.id === placeholderId)
          if (assistantMessage && typeof payload.message === 'string' && !assistantMessage.content) {
            assistantMessage.content = payload.message
            assistantMessage.displayContent = payload.message
          }
        },
        onError: (message) => {
          error.value = message
          isStreaming.value = false
          streamingConversationId.value = null
          activeStream.value = null
        },
        onAssistantMessageCreated: (payload) => {
          if (currentConversation.value?.id !== conversationId) return
          if (typeof payload.messageId !== 'string') return
          const messages = currentConversation.value.messages
          if (!messages) return
          const newAssistant: Message = {
            id: payload.messageId,
            role: 'assistant',
            content: '',
            displayContent: '',
            displayThinking: '',
            createdAt: new Date().toISOString()
          }
          messages.push(newAssistant)
        }
      }
    )
  }

  function stopStreaming() {
    activeStream.value?.abort()
    activeStream.value = null
    isStreaming.value = false
    streamingConversationId.value = null
    clearAllTypingTimers()
    clearAllThinkingTimers()
  }

  return {
    conversations,
    currentConversation,
    isLoading,
    isStreaming,
    streamingConversationId,
    error,
    buildConversationTitle,
    fetchConversations,
    fetchConversation,
    createConversation,
    deleteConversation,
    openNewConversation,
    syncConversationTitle,
    sendMessage,
    stopStreaming
  }
})
