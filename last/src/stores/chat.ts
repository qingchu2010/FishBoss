import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  created_at: string | null
  updated_at: string | null
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const messages = ref<Message[]>([])
  const activeConversationId = ref<string | null>(null)
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const wsConnected = ref(false)

  const sendMessage = (content: string) => {
    messages.value.push({
      id: `user_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now()
    })

    setTimeout(() => {
      messages.value.push({
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: 'Demo response - Connect to your backend for real chat.',
        timestamp: Date.now()
      })
    }, 1000)
  }

  const createConversation = (title?: string) => {
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      title: title || `Chat ${new Date().toLocaleTimeString()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    conversations.value.unshift(newConv)
    activeConversationId.value = newConv.id
    messages.value = []
  }

  const deleteConversation = (id: string) => {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value[0]?.id || null
      messages.value = []
    }
  }

  const selectConversation = async (id: string) => {
    activeConversationId.value = id
  }

  return {
    conversations,
    messages,
    activeConversationId,
    isLoading,
    isStreaming,
    wsConnected,
    sendMessage,
    createConversation,
    deleteConversation,
    selectConversation
  }
})
