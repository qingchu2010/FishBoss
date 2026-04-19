import type { ToolInfo, ToolContext, toolToOpenAIFormat } from './tool.js'
import { bashTool } from './tools/bash.js'
import { readTool } from './tools/read.js'
import { writeTool } from './tools/write.js'
import { editTool } from './tools/edit.js'
import { globTool } from './tools/glob.js'
import { grepTool } from './tools/grep.js'
import { lsTool } from './tools/ls.js'
import { todosTool } from './tools/todos.js'
import { askTool } from './tools/ask.js'

class ToolRegistry {
  private tools: Map<string, ToolInfo> = new Map()
  
  constructor() {
    this.register(bashTool)
    this.register(readTool)
    this.register(writeTool)
    this.register(editTool)
    this.register(globTool)
    this.register(grepTool)
    this.register(lsTool)
    this.register(todosTool)
    this.register(askTool)
  }
  
  register(tool: ToolInfo): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Tool "${tool.id}" is already registered, overwriting`)
    }
    this.tools.set(tool.id, tool)
  }
  
  get(id: string): ToolInfo | undefined {
    return this.tools.get(id)
  }
  
  list(): ToolInfo[] {
    return Array.from(this.tools.values())
  }
  
  ids(): string[] {
    return Array.from(this.tools.keys())
  }
  
  getOpenAITools(): ReturnType<typeof toolToOpenAIFormat>[] {
    return this.list().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.definition.description,
        parameters: this.zodToJsonSchema(tool.definition.parameters)
      }
    }))
  }
  
  async execute(
    toolId: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<{ title: string; output: string; metadata?: Record<string, unknown> }> {
    const tool = this.get(toolId)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolId}`)
    }
    
    return tool.definition.execute(args, ctx)
  }
  
  private zodToJsonSchema(schema: any): Record<string, unknown> {
    if (typeof schema.toJSONSchema === 'function') {
      return schema.toJSONSchema() as Record<string, unknown>
    }
    
    const def = schema._def || schema.def
    const type = def?.type || schema.type
    
    if (type === 'object' && def?.shape) {
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      
      const shape = def.shape
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value)
        const valueType = (value as any)._def?.type || (value as any).type
        if (valueType !== 'optional') {
          required.push(key)
        }
      }
      
      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false
      }
    }
    
    if (type === 'string') {
      return { type: 'string' }
    }
    
    if (type === 'number' || type === 'int') {
      return { type: 'number' }
    }
    
    if (type === 'boolean') {
      return { type: 'boolean' }
    }
    
    if (type === 'array' && def?.element) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(def.element)
      }
    }
    
    if (type === 'optional' && def?.inner) {
      return this.zodToJsonSchema(def.inner)
    }
    
    if (type === 'default' && def?.inner) {
      return this.zodToJsonSchema(def.inner)
    }
    
    if (type === 'enum' && def?.values) {
      return {
        type: 'string',
        enum: def.values
      }
    }
    
    return { type: 'object' }
  }
}

export const toolRegistry = new ToolRegistry()
