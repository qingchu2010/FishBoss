import type { ProviderType, ToolCall } from '../../types/index.js'

export interface StreamDelta {
  content: string
  thinking?: string
  toolCalls: ToolCall[]
}

export function parseStreamChunk(
  type: ProviderType,
  data: unknown
): StreamDelta | null {
  if (!data) return null

  switch (type) {
    case 'anthropic':
      return parseAnthropicStreamChunk(data)
    case 'gemini':
      return parseGeminiStreamChunk(data)
    case 'minimax':
      return parseMinimaxStreamChunk(data)
    default:
      return parseOpenAIStreamChunk(data)
  }
}

function parseOpenAIStreamChunk(data: unknown): StreamDelta | null {
  const chunk = data as {
    choices?: Array<{
      delta?: {
        content?: string
        tool_calls?: Array<{
          index: number
          id?: string
          type?: string
          function?: {
            name?: string
            arguments?: string
          }
        }>
      }
    }>
  }

  const delta = chunk.choices?.[0]?.delta
  if (!delta) return null

  const toolCalls: ToolCall[] = []
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      toolCalls.push({
        id: tc.id || '',
        type: 'function',
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || ''
        }
      })
    }
  }

  return {
    content: delta.content || '',
    toolCalls
  }
}

function parseAnthropicStreamChunk(data: unknown): StreamDelta | null {
  const chunk = data as {
    type?: string
    delta?: {
      type?: string
      text?: string
      thinking?: string
    }
    content_block?: {
      type?: string
      id?: string
      name?: string
    }
  }

  if (chunk.type === 'content_block_delta') {
    if (chunk.delta?.type === 'thinking_delta') {
      return {
        content: '',
        thinking: chunk.delta.thinking || '',
        toolCalls: []
      }
    }
    if (chunk.delta?.type === 'text_delta') {
      return {
        content: chunk.delta.text || '',
        toolCalls: []
      }
    }
  }

  if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
    return {
      content: '',
      toolCalls: [{
        id: chunk.content_block.id || '',
        type: 'function',
        function: {
          name: chunk.content_block.name || '',
          arguments: ''
        }
      }]
    }
  }

  return null
}

function parseGeminiStreamChunk(data: unknown): StreamDelta | null {
  const chunk = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  }

  const candidate = chunk.candidates?.[0]
  let content = ''

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) content += part.text
    }
  }

  if (!content) return null

  return {
    content,
    toolCalls: []
  }
}

function parseMinimaxStreamChunk(data: unknown): StreamDelta | null {
  const chunk = data as {
    choices?: Array<{
      delta?: {
        content?: string
        reasoning_content?: string
        tool_calls?: Array<{
          id?: string
          function?: {
            name?: string
            arguments?: string | Record<string, unknown>
          }
        }>
      }
    }>
  }

  const delta = chunk.choices?.[0]?.delta
  if (!delta) return null

  const toolCalls: ToolCall[] = []
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      toolCalls.push({
        id: tc.id || Math.random().toString(36).substring(2),
        type: 'function',
        function: {
          name: tc.function?.name || '',
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || {})
        }
      })
    }
  }

  return {
    content: delta.content || '',
    thinking: delta.reasoning_content || '',
    toolCalls
  }
}
