import type { ProviderType, ToolCall } from '../../types/index.js'

export interface ParsedResponse {
  content: string
  thinking?: string
  toolCalls: ToolCall[]
  finishReason?: string
}

export function parseResponse(
  type: ProviderType,
  data: unknown
): ParsedResponse {
  switch (type) {
    case 'anthropic':
      return parseAnthropicResponse(data)
    case 'gemini':
      return parseGeminiResponse(data)
    case 'minimax':
      return parseMinimaxResponse(data)
    default:
      return parseOpenAIResponse(data)
  }
}

function parseOpenAIResponse(data: unknown): ParsedResponse {
  const response = data as {
    choices?: Array<{
      message?: {
        content?: string
        tool_calls?: Array<{
          id: string
          type: string
          function: { name: string; arguments: string }
        }>
      }
      finish_reason?: string
    }>
  }

  const choice = response.choices?.[0]
  const content = choice?.message?.content || ''
  const toolCalls: ToolCall[] = []

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      toolCalls.push({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })
    }
  }

  return {
    content,
    toolCalls,
    finishReason: choice?.finish_reason
  }
}

function parseAnthropicResponse(data: unknown): ParsedResponse {
  const response = data as {
    content?: Array<{
      type: string
      text?: string
    }>
    stop_reason?: string
  }

  let content = ''
  let thinking = ''

  if (response.content) {
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text || ''
      } else if (block.type === 'thinking') {
        thinking += (block as { thinking?: string }).thinking || ''
      }
    }
  }

  return {
    content,
    thinking,
    toolCalls: [],
    finishReason: response.stop_reason
  }
}

function parseGeminiResponse(data: unknown): ParsedResponse {
  const response = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
      finishReason?: string
    }>
  }

  const candidate = response.candidates?.[0]
  let content = ''

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) content += part.text
    }
  }

  return {
    content,
    toolCalls: [],
    finishReason: candidate?.finishReason
  }
}

function parseMinimaxResponse(data: unknown): ParsedResponse {
  const response = data as {
    choices?: Array<{
      message?: {
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

  const choice = response.choices?.[0]
  const content = choice?.message?.content || ''
  const thinking = choice?.message?.reasoning_content || ''
  const toolCalls: ToolCall[] = []

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
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
    content,
    thinking,
    toolCalls
  }
}
