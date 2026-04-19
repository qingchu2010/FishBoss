import { ref } from 'vue'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'compressed'
  content: string
  timestamp: number
  thinking?: string
  toolCallId?: string
  name?: string
  toolCalls?: ToolCall[]
}

export interface ToolCallMessage extends Message {
  role: 'tool'
  toolCallId: string
  name: string
}

export interface AskQuestion {
  question: string
  options: Array<{ label: string; description: string }>
  multiSelect: boolean
}

export interface AskData {
  id: string
  header?: string
  questions: AskQuestion[]
}

export type AskAnswer =
  | string
  | string[]
  | {
      type: 'custom' | 'single' | 'multi'
      value: string | string[]
    }
  | {
      type: 'multi_step'
      value: Array<{
        question: string
        answerType: 'custom' | 'single' | 'multi'
        answer: string | string[]
      }>
    }

export interface SessionOptions {
  sessionId?: string
  modelId?: string
  providerId?: string
  tools?: unknown[]
  enableTools?: boolean
}

type StreamEvent =
  | { type: 'session'; sessionId: string; created: boolean }
  | { type: 'reasoning'; delta: string }
  | { type: 'content'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: string; success: boolean }
  | { type: 'tool_error'; id: string; error: string }
  | { type: 'context_warning'; used: number; limit: number }
  | { type: 'compressed'; messageCount: number }
  | { type: 'done'; finalMessageId: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'ask'; id: string; header?: string; questions: AskQuestion[] }
  | { type: 'ask_result'; askId: string; success: boolean }
  | { type: 'pending_message'; content: string }

export function useAgentStream() {
  const messages = ref<(Message | ToolCallMessage)[]>([])
  const isStreaming = ref(false)
  const currentThinking = ref('')
  const streamingContent = ref('')
  const pendingToolCalls = ref<ToolCall[]>([])
  const error = ref<string | null>(null)
  const ask = ref<AskData | null>(null)
  const contextUsage = ref(0)

  let sessionId: string | null = null
  let currentMessageId: string | null = null
  let currentContent = ''
  let currentToolCalls: ToolCall[] = []
  let abortController: AbortController | null = null

  function reset() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    sessionId = null
    currentMessageId = null
    currentContent = ''
    currentToolCalls = []
    messages.value = []
    isStreaming.value = false
    currentThinking.value = ''
    streamingContent.value = ''
    pendingToolCalls.value = []
    error.value = null
    ask.value = null
    contextUsage.value = 0
  }

  function startSession(agentId: string, message: string, options?: SessionOptions) {
    if (abortController) {
      abortController.abort()
    }
    isStreaming.value = true
    error.value = null
    currentThinking.value = ''
    streamingContent.value = ''
    pendingToolCalls.value = []
    error.value = null
    ask.value = null
    contextUsage.value = 0

    abortController = new AbortController()

    const body: Record<string, unknown> = { agentId, message }
    if (options?.sessionId) body.sessionId = options.sessionId
    if (options?.modelId) body.modelId = options.modelId
    if (options?.providerId) body.providerId = options.providerId
    if (options?.enableTools !== undefined) body.enableTools = options.enableTools
    if (options?.tools && options.tools.length > 0) body.tools = options.tools
    if (messages.value.length > 0) body.conversationHistory = messages.value

    fetch('/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal
    }).then(async (response) => {
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
        }
        error.value = errorMessage
        isStreaming.value = false
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        error.value = 'No response body'
        isStreaming.value = false
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              handleDone('')
              return
            }
            try {
              const event: StreamEvent = JSON.parse(data)
              handleStreamEvent(event)
            } catch (e) {
              console.error('Failed to parse stream event:', e)
            }
          }
        }
      }

      handleDone('')
    }).catch((e) => {
      if (e.name !== 'AbortError') {
        error.value = e.message || 'Connection error'
      }
      isStreaming.value = false
    })
  }

  function handleDone(finalMessageId: string) {
    if (currentMessageId || currentContent || currentThinking.value || currentToolCalls.length > 0) {
      const finalMessage: Message = {
        id: finalMessageId || `msg_${Date.now()}`,
        role: 'assistant',
        content: currentContent,
        timestamp: Date.now(),
        thinking: currentThinking.value || undefined,
        toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined
      }
      messages.value.push(finalMessage)
      currentMessageId = finalMessageId || currentMessageId
    }
    isStreaming.value = false
    currentThinking.value = ''
    streamingContent.value = ''
    currentContent = ''
    currentToolCalls = []
  }

  function handleStreamEvent(data: StreamEvent) {
    switch (data.type) {
      case 'session':
        sessionId = data.sessionId
        break

      case 'reasoning':
        currentThinking.value += data.delta
        break

      case 'content':
        currentContent += data.delta
        streamingContent.value = currentContent
        break

      case 'tool_call':
        currentToolCalls.push({
          id: data.id,
          name: data.name,
          arguments: typeof data.arguments === 'string' ? JSON.parse(data.arguments) : data.arguments
        })
        break

      case 'tool_result': {
        const toolMessage: ToolCallMessage = {
          id: `tool_${data.id}`,
          role: 'tool',
          content: data.result,
          timestamp: Date.now(),
          toolCallId: data.id,
          name: data.name
        }
        messages.value.push(toolMessage)
        pendingToolCalls.value = pendingToolCalls.value.filter(tc => tc.id !== data.id)
        break
      }

      case 'tool_error': {
        const errorMessage: Message = {
          id: `tool_error_${data.id}`,
          role: 'error',
          content: data.error,
          timestamp: Date.now(),
          toolCallId: data.id
        }
        messages.value.push(errorMessage)
        pendingToolCalls.value = pendingToolCalls.value.filter(tc => tc.id !== data.id)
        break
      }

      case 'context_warning':
        contextUsage.value = (data.used / data.limit) * 100
        break

      case 'compressed': {
        const compressedMsg: Message = {
          id: `compressed_${Date.now()}`,
          role: 'compressed',
          content: `[Compressed ${data.messageCount} messages]`,
          timestamp: Date.now()
        }
        messages.value.push(compressedMsg)
        break
      }

      case 'done':
        handleDone(data.finalMessageId)
        break

      case 'error':
        error.value = data.message
        isStreaming.value = false
        break

      case 'ask':
        ask.value = {
          id: data.id,
          header: data.header,
          questions: data.questions
        }
        break

      case 'ask_result':
        if (ask.value && ask.value.id === data.askId) {
          ask.value = null
        }
        break

      case 'pending_message':
        currentContent = data.content
        break
    }
  }

  function stopSession() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (sessionId) {
      fetch(`/api/agent/stream/${sessionId}`, {
        method: 'DELETE'
      }).catch((e) => {
        console.error('Failed to stop session:', e)
      })
    }
    isStreaming.value = false
    sessionId = null
  }

  async function submitAskResponse(answer: AskAnswer) {
    if (!sessionId || !ask.value) {
      return
    }
    const askId = ask.value.id
    ask.value = null
    try {
      await fetch(`/api/agent/session/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askId, answer })
      })
    } catch (e) {
      console.error('Failed to submit ask response:', e)
      throw e
    }
  }

  return {
    messages,
    isStreaming,
    currentThinking,
    streamingContent,
    pendingToolCalls,
    error,
    ask,
    contextUsage,
    startSession,
    stopSession,
    submitAskResponse,
    reset
  }
}