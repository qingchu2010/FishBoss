import { get } from './http'

export interface ToolkitToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
  defaultValue?: string | number | boolean | string[] | Record<string, unknown>
  enumValues?: string[]
}

export interface ToolkitTool {
  id: string
  name: string
  title: string
  category: 'file' | 'search' | 'command' | 'web' | 'workflow' | 'agent'
  description: string
  longDescription: string
  parameters: ToolkitToolParameter[]
  tags: string[]
  readOnly: boolean
  concurrencySafe: boolean
  executable: boolean
}

export const toolsApi = {
  async list(): Promise<ToolkitTool[]> {
    const response = await get<{ tools: ToolkitTool[] }>('/tools')
    return response.tools
  }
}
