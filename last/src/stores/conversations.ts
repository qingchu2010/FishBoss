import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'compressed'
  content: string
  timestamp: number
  thinking?: string
  toolCallId?: string
  name?: string
  toolCalls?: Array<{
    id: string
    function: {
      name: string
      arguments: string
    }
    status?: 'pending' | 'running' | 'completed' | 'error'
    result?: string
  }>
}

export interface ConversationMeta {
  id: string
  title: string
  agentId: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Conversation extends ConversationMeta {
  messages: Message[]
}

const MAX_PERSISTED_MESSAGE_CONTENT_LENGTH = 16000
const MAX_PERSISTED_THINKING_LENGTH = 12000
const MAX_PERSISTED_TOOL_ARGUMENTS_LENGTH = 4000
const MAX_PERSISTED_TOOL_RESULT_LENGTH = 16000
const MAX_PERSISTED_CONVERSATION_CHARS = 1000000

function clipText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}\n...`
}

function sanitizeToolCalls(toolCalls: Message['toolCalls']): Message['toolCalls'] {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined
  }

  return toolCalls.map(toolCall => ({
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: clipText(toolCall.function.arguments, MAX_PERSISTED_TOOL_ARGUMENTS_LENGTH) || ''
    },
    result: clipText(toolCall.result, MAX_PERSISTED_TOOL_RESULT_LENGTH)
  }))
}

function getMessageSize(message: Message): number {
  let size = message.content.length + (message.thinking?.length || 0)

  if (message.name) {
    size += message.name.length
  }

  if (message.toolCallId) {
    size += message.toolCallId.length
  }

  if (message.toolCalls) {
    for (const toolCall of message.toolCalls) {
      size += toolCall.id.length
      size += toolCall.function.name.length
      size += toolCall.function.arguments.length
      size += toolCall.result?.length || 0
      size += toolCall.status?.length || 0
    }
  }

  return size
}

function buildPersistedMessages(messages: Message[]): Message[] {
  const sanitizedMessages = messages.map(message => ({
    ...message,
    content: clipText(message.content, MAX_PERSISTED_MESSAGE_CONTENT_LENGTH) || '',
    thinking: clipText(message.thinking, MAX_PERSISTED_THINKING_LENGTH),
    toolCalls: sanitizeToolCalls(message.toolCalls)
  }))

  const compressedMessages = sanitizedMessages.filter(message => message.role === 'compressed')
  const recentMessages = sanitizedMessages.filter(message => message.role !== 'compressed')
  const persistedMessages: Message[] = []
  let remainingBudget = MAX_PERSISTED_CONVERSATION_CHARS

  if (compressedMessages.length > 0) {
    const latestCompressedMessage = compressedMessages[compressedMessages.length - 1]
    persistedMessages.push(latestCompressedMessage)
    remainingBudget -= getMessageSize(latestCompressedMessage)
  }

  const recentTail: Message[] = []

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index]
    const messageSize = getMessageSize(message)

    if (recentTail.length === 0 || remainingBudget - messageSize >= 0) {
      recentTail.unshift(message)
      remainingBudget -= messageSize
      continue
    }

    break
  }

  return [...persistedMessages, ...recentTail]
}

export const useConversationStore = defineStore('conversations', () => {
  const conversations = ref<ConversationMeta[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const isLoading = ref(false)

  const sortedConversations = computed(() => {
    return [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  })

  async function loadConversations() {
    isLoading.value = true
    try {
      const data = await api.getConversations()
      conversations.value = data.conversations || []
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function loadConversation(id: string) {
    isLoading.value = true
    try {
      currentConversation.value = await api.getConversation(id)
    } catch (error) {
      console.error('Failed to load conversation:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function createConversation(title?: string, agentId?: string) {
    try {
      const conversation = await api.createConversation(title, agentId)
      conversations.value.unshift({
        id: conversation.id,
        title: conversation.title,
        agentId: conversation.agentId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: 0
      })
      currentConversation.value = conversation
      return conversation
    } catch (error) {
      console.error('Failed to create conversation:', error)
      throw error
    }
  }

  async function updateConversationTitle(id: string, title: string) {
    try {
      await api.updateConversation(id, { title })
      const index = conversations.value.findIndex(c => c.id === id)
      if (index !== -1) {
        conversations.value[index].title = title
      }
      if (currentConversation.value?.id === id) {
        currentConversation.value.title = title
      }
    } catch (error) {
      console.error('Failed to update conversation title:', error)
    }
  }

  async function saveMessages(id: string, messages: Message[]) {
    try {
      const persistedMessages = buildPersistedMessages(messages)
      await api.updateConversation(id, { messages: persistedMessages })
      const updatedAt = Date.now()
      const index = conversations.value.findIndex(c => c.id === id)
      if (index !== -1) {
        conversations.value[index].messageCount = persistedMessages.length
        conversations.value[index].updatedAt = updatedAt
      }
      if (currentConversation.value?.id === id) {
        currentConversation.value = {
          ...currentConversation.value,
          messages: persistedMessages,
          updatedAt
        }
      }
    } catch (error) {
      console.error('Failed to save messages:', error)
      throw error
    }
  }

  async function deleteConversation(id: string) {
    try {
      await api.deleteConversation(id)
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentConversation.value?.id === id) {
        currentConversation.value = null
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  function clearCurrentConversation() {
    currentConversation.value = null
  }

  return {
    conversations,
    currentConversation,
    isLoading,
    sortedConversations,
    loadConversations,
    loadConversation,
    createConversation,
    updateConversationTitle,
    saveMessages,
    deleteConversation,
    clearCurrentConversation
  }
})
