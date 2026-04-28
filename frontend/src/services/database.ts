import { del, get } from './http'

export type DatabaseConversationClass = 'chat-console' | 'qq' | 'onebot' | 'platform'

export interface DatabaseReference {
  id: string
  namespace: string
  ownerUserId: string
  conversationId?: string
  title: string
  content: Record<string, unknown>
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface DatabaseMessageThread {
  id: string
  conversationClass: DatabaseConversationClass
  ownerUserId: string
  targetId: string
  platformId?: string
  platformType?: string
  title: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface DatabaseMessage {
  id: string
  threadId: string
  conversationClass: DatabaseConversationClass
  direction: 'inbound' | 'outbound' | 'internal'
  senderType: 'user' | 'assistant' | 'system' | 'platform'
  senderId?: string
  externalMessageId?: string
  content: string
  payload?: Record<string, unknown>
  createdAt: string
}

export const databaseApi = {
  async listReferences(): Promise<DatabaseReference[]> {
    const response = await get<{ references: DatabaseReference[] }>('/database/references')
    return response.references
  },

  async listMessageThreads(): Promise<DatabaseMessageThread[]> {
    const response = await get<{ threads: DatabaseMessageThread[] }>('/database/message-threads')
    return response.threads
  },

  async deleteMessageThread(id: string): Promise<void> {
    await del(`/database/message-threads/${encodeURIComponent(id)}`)
  },

  async listMessages(threadId: string): Promise<DatabaseMessage[]> {
    const response = await get<{ messages: DatabaseMessage[] }>(
      `/database/messages?threadId=${encodeURIComponent(threadId)}`
    )
    return response.messages
  }
}
