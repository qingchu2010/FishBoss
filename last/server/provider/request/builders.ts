import type { ProviderType, ChatMessage, Tool, ToolCall } from '../types/index.js'

export interface RequestBody {
  model: string
  messages: unknown
  stream?: boolean
  tools?: unknown
  max_tokens?: number
  temperature?: number
}

export function buildRequestBody(
  type: ProviderType,
  modelId: string,
  messages: ChatMessage[],
  tools?: Tool[],
  enableTools?: boolean,
  stream?: boolean
): RequestBody {
  switch (type) {
    case 'anthropic':
      return buildAnthropicRequest(modelId, messages, tools, enableTools, stream)
    case 'gemini':
      return buildGeminiRequest(modelId, messages, tools, enableTools, stream)
    case 'minimax':
      return buildMinimaxRequest(modelId, messages, tools, enableTools, stream)
    default:
      return buildOpenAIRequest(modelId, messages, tools, enableTools, stream)
  }
}

function buildOpenAIRequest(
  modelId: string,
  messages: ChatMessage[],
  tools?: Tool[],
  enableTools?: boolean,
  stream?: boolean
): RequestBody {
  return {
    model: modelId,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
    })),
    stream,
    tools: enableTools ? tools : undefined
  }
}

function buildAnthropicRequest(
  modelId: string,
  messages: ChatMessage[],
  tools?: Tool[],
  enableTools?: boolean,
  stream?: boolean
): RequestBody {
  const systemMessage = messages.find(m => m.role === 'system')
  const otherMessages = messages.filter(m => m.role !== 'system')

  return {
    model: modelId,
    max_tokens: 4096,
    messages: otherMessages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content
    })),
    system: systemMessage?.content as string,
    stream,
    tools: enableTools ? tools : undefined
  }
}

function buildGeminiRequest(
  modelId: string,
  messages: ChatMessage[],
  _tools?: Tool[],
  _enableTools?: boolean,
  _stream?: boolean
): RequestBody {
  return {
    model: modelId,
    messages: messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content as string }]
      }))
  }
}

function buildMinimaxRequest(
  modelId: string,
  messages: ChatMessage[],
  tools?: Tool[],
  enableTools?: boolean,
  stream?: boolean
): RequestBody {
  return {
    model: modelId,
    messages: messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id,
          name: m.name
        }
      }
      if (m.role === 'system') {
        return {
          role: 'system',
          content: m.content
        }
      }
      const msg: any = {
        role: m.role === 'user' ? 'user' : 'assistant',
        ...(m.content ? { content: m.content } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.name ? { name: m.name } : {})
      }
      return msg
    }),
    stream,
    tools: enableTools ? tools : undefined
  }
}
