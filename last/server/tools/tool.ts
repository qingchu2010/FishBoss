import { z } from 'zod'

export interface ToolMetadata {
  [key: string]: unknown
}

export interface ToolContext {
  sessionId: string
  workingDirectory: string
  abort?: AbortSignal
  askPermission: (request: PermissionRequest) => Promise<boolean>
}

export interface PermissionRequest {
  permission: string
  patterns: string[]
  metadata?: Record<string, unknown>
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> {
  description: string
  parameters: T
  execute(
    args: z.infer<T>,
    ctx: ToolContext
  ): Promise<{
    title: string
    metadata?: M
    output: string
  }>
}

export interface ToolInfo<T extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> {
  id: string
  definition: ToolDefinition<T, M>
}

export type InferParameters<T> = T extends ToolInfo<infer P, any> ? z.infer<P> : never
export type InferMetadata<T> = T extends ToolInfo<any, infer M> ? M : never

export function defineTool<T extends z.ZodType, M extends ToolMetadata = ToolMetadata>(
  id: string,
  definition: ToolDefinition<T, M>
): ToolInfo<T, M> {
  return {
    id,
    definition: {
      ...definition,
      execute: async (args: z.infer<T>, ctx: ToolContext) => {
        try {
          const normalizedArgs = normalizeArguments(definition.parameters, args)
          const parsedArgs = definition.parameters.parse(normalizedArgs)
          return definition.execute(parsedArgs, ctx)
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new Error(
              `Tool "${id}" received invalid arguments: ${error.message}`
            )
          }
          throw error
        }
      }
    }
  }
}

export function toolToOpenAIFormat(tool: ToolInfo): {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
} {
  const schema = tool.definition.parameters
  const jsonSchema = zodToJsonSchema(schema)
  
  return {
    type: 'function',
    function: {
      name: tool.id,
      description: tool.definition.description,
      parameters: jsonSchema
    }
  }
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (typeof (schema as any).toJSONSchema === 'function') {
    return (schema as any).toJSONSchema() as Record<string, unknown>
  }
  
  const def = (schema as any)._def || (schema as any).def
  const type = def?.type || (schema as any).type
  
  if (type === 'object' && def?.shape) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    
    const shape = def.shape
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType)
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
      items: zodToJsonSchema(def.element)
    }
  }
  
  if (type === 'optional' && def?.inner) {
    return zodToJsonSchema(def.inner)
  }
  
  if (type === 'default' && def?.inner) {
    return zodToJsonSchema(def.inner)
  }
  
  if (type === 'enum' && def?.values) {
    return {
      type: 'string',
      enum: def.values
    }
  }
  
  if (type === 'literal' && def?.value !== undefined) {
    return {
      type: typeof def.value as 'string' | 'number' | 'boolean',
      const: def.value
    }
  }
  
  if (type === 'union' && def?.options) {
    return {
      oneOf: def.options.map(zodToJsonSchema)
    }
  }
  
  if (type === 'record' && def?.valueType) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(def.valueType)
    }
  }
  
  return { type: 'object' }
}

interface SchemaDefinition {
  type?: string
  shape?: Record<string, z.ZodType>
  inner?: z.ZodType
  innerType?: z.ZodType
  element?: z.ZodType
}

function getSchemaDefinition(schema: z.ZodType): SchemaDefinition {
  const withDefinition = schema as z.ZodType & {
    _def?: SchemaDefinition
    def?: SchemaDefinition
    type?: string
  }
  return withDefinition._def || withDefinition.def || { type: withDefinition.type }
}

function normalizeArguments(schema: z.ZodType, value: unknown): unknown {
  const def = getSchemaDefinition(schema)
  const type = def.type

  if (type === 'optional' || type === 'default') {
    const innerSchema = def.innerType || def.inner
    return innerSchema ? normalizeArguments(innerSchema, value) : value
  }

  if (value === undefined || value === null) {
    return value
  }

  if ((type === 'number' || type === 'int') && typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return value
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : value
  }

  if (type === 'boolean' && typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true') {
      return true
    }
    if (trimmed === 'false') {
      return false
    }
    return value
  }

  if (type === 'array' && def.element && Array.isArray(value)) {
    return value.map(item => normalizeArguments(def.element!, item))
  }

  if (type === 'object' && def.shape && typeof value === 'object' && !Array.isArray(value)) {
    const normalized: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value)) {
      const entrySchema = def.shape[key]
      normalized[key] = entrySchema
        ? normalizeArguments(entrySchema, entryValue)
        : entryValue
    }
    return normalized
  }

  return value
}
