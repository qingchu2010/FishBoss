import type { ToolCall } from '../../types/index.js'

export function parseToolCallsFromText(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  
  const thinkRegex = /<think[^>]*>[\s\S]*?<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/think>/g
  let match
  
  while ((match = thinkRegex.exec(text)) !== null) {
    const toolName = match[1]
    const argsContent = match[2]
    
    const args: Record<string, string> = {}
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g
    let paramMatch
    
    while ((paramMatch = paramRegex.exec(argsContent)) !== null) {
      args[paramMatch[1]] = paramMatch[2]
    }
    
    toolCalls.push({
      id: Math.random().toString(36).substring(2),
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args)
      }
    })
  }
  
  if (toolCalls.length > 0) return toolCalls
  
  const invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g
  while ((match = invokeRegex.exec(text)) !== null) {
    const toolName = match[1]
    const argsContent = match[2]
    
    const args: Record<string, string> = {}
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g
    let paramMatch
    
    while ((paramMatch = paramRegex.exec(argsContent)) !== null) {
      args[paramMatch[1]] = paramMatch[2]
    }
    
    toolCalls.push({
      id: Math.random().toString(36).substring(2),
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args)
      }
    })
  }
  
  return toolCalls
}
