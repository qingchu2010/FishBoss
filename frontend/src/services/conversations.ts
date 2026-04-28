import { del, get, post, getApiErrorCode, getApiErrorMessage, isSessionAuthError, triggerAuthUnauthorizedHandler } from './http'

export interface ConversationUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface ConversationMessageMetadata {
  finishReason?: string
  tokens?: number
  thinking?: string
  usage?: ConversationUsage
  [key: string]: unknown
}

export interface ConversationToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
  status?: 'pending' | 'running' | 'completed' | 'error'
  result?: string
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  displayContent?: string
  displayThinking?: string
  createdAt: string
  toolCalls?: ConversationToolCall[]
  toolCallId?: string
  name?: string
  metadata?: ConversationMessageMetadata
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages?: ConversationMessage[]
  metadata?: {
    agentId?: string
    providerId?: string
    modelId?: string
    conversationClass?: 'chat-console' | 'qq' | 'onebot' | 'platform'
    platformId?: string
    platformType?: string
    externalThreadId?: string
    tags?: string[]
  }
}

export interface StreamCallbacks {
  onStart?: (payload: Record<string, unknown>) => void
  onChunk?: (payload: Record<string, unknown>) => void
  onToolEvent?: (payload: Record<string, unknown>) => void
  onComplete?: (payload: Record<string, unknown>) => void
  onErrorEvent?: (payload: Record<string, unknown>) => void
  onError?: (message: string) => void
  onAssistantMessageCreated?: (payload: Record<string, unknown>) => void
}

export const conversationsApi = {
  async list(): Promise<Conversation[]> {
    const response = await get<{ conversations: Conversation[] }>('/conversations')
    return response.conversations
  },

  async get(id: string): Promise<Conversation> {
    const response = await get<{ conversation: Conversation }>(`/conversations/${id}`)
    return response.conversation
  },

  async create(data: { title?: string; metadata?: Conversation['metadata'] }): Promise<Conversation> {
    const response = await post<{ conversation: Conversation }>('/conversations', data)
    return response.conversation
  },

  async update(id: string, data: { title?: string; metadata?: Conversation['metadata'] }): Promise<Conversation> {
    const response = await post<{ conversation: Conversation }>(`/conversations/${id}`, data, 'PATCH')
    return response.conversation
  },

  async remove(id: string): Promise<void> {
    await del(`/conversations/${id}`)
  },

  async listMessages(id: string): Promise<ConversationMessage[]> {
    const response = await get<{ messages: ConversationMessage[] }>(`/conversations/${id}/messages`)
    return response.messages
  },

  async appendMessage(id: string, data: { role: ConversationMessage['role']; content: string; metadata?: Record<string, unknown> }): Promise<ConversationMessage> {
    const response = await post<{ message: ConversationMessage }>(`/conversations/${id}/messages`, data)
    return response.message
  },

  stream(id: string, payload: { message: string; model?: string; provider?: string; tools?: string[] }, callbacks: StreamCallbacks): AbortController {
    const controller = new AbortController()

    fetch(`/api/conversations/${id}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: id,
        ...payload
      }),
      credentials: 'include',
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        let errorCode: string | null = null

        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errorBody = await response.json() as Record<string, unknown>
            errorCode = getApiErrorCode(errorBody)
            message = getApiErrorMessage(errorBody) || message
          } else {
            const text = (await response.text()).trim()
            if (text) {
              message = text
            }
          }
        } catch {
          console.error('Failed to parse conversation stream error response')
        }

        if (response.status === 401 && isSessionAuthError(errorCode)) {
          triggerAuthUnauthorizedHandler()
        }

        callbacks.onError?.(message)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.('Missing response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const eventLine = chunk.split('\n').find((line) => line.startsWith('event: '))
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))
          if (!dataLine) continue

          const eventName = eventLine?.slice(7) ?? 'message'
          const eventPayload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>

          if (eventPayload.error && typeof eventPayload.error === 'object') {
            const errorCode = getApiErrorCode(eventPayload)
            const message = getApiErrorMessage(eventPayload) || 'Request failed'
            callbacks.onError?.(message)
            if (errorCode && isSessionAuthError(errorCode)) {
              triggerAuthUnauthorizedHandler()
            }
            continue
          }

          if (eventName === 'stream_start' || eventName === 'stream_started') {
            callbacks.onStart?.(eventPayload)
          } else if (eventName === 'stream_chunk') {
            callbacks.onChunk?.(eventPayload)
          } else if (eventName === 'stream_tool_calls') {
            callbacks.onToolEvent?.(eventPayload)
          } else if (eventName === 'stream_complete') {
            callbacks.onComplete?.(eventPayload)
          } else if (eventName === 'stream_error') {
            callbacks.onErrorEvent?.(eventPayload)
            callbacks.onError?.(typeof eventPayload.message === 'string' ? eventPayload.message : 'Request failed')
          } else if (eventName === 'stream_assistant_message_created') {
            callbacks.onAssistantMessageCreated?.(eventPayload)
          }
        }
      }
    }).catch((error: Error) => {
      if (error.name !== 'AbortError') {
        callbacks.onError?.(error.message)
      }
    })

    return controller
  }
}
