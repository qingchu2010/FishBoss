import { del, get, post } from './http'

export interface MCPServer {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  error?: string
}

export const mcpApi = {
  async listServers(): Promise<MCPServer[]> {
    const response = await get<{ servers: MCPServer[] }>('/mcp')
    return response.servers
  },

  async createServer(data: Pick<MCPServer, 'name' | 'command' | 'args' | 'env' | 'enabled'>): Promise<MCPServer> {
    const response = await post<{ server: MCPServer }>('/mcp', data)
    return response.server
  },

  async updateServer(id: string, data: Partial<Pick<MCPServer, 'name' | 'command' | 'args' | 'env' | 'enabled'>>): Promise<MCPServer> {
    const response = await post<{ server: MCPServer }>(`/mcp/${id}`, data, 'PATCH')
    return response.server
  },

  async deleteServer(id: string): Promise<void> {
    await del(`/mcp/${id}`)
  },

  async installServer(id: string) {
    const response = await post<{ result: { success: boolean; message: string } }>(`/mcp/${id}/install`)
    return response.result
  },

  async startServer(id: string) {
    const response = await post<{ result: { success: boolean; error?: string } }>(`/mcp/${id}/start`)
    return response.result
  },

  async stopServer(id: string) {
    const response = await post<{ result: { success: boolean; error?: string } }>(`/mcp/${id}/stop`)
    return response.result
  },

  async restartServer(id: string) {
    const response = await post<{ result: { success: boolean; error?: string } }>(`/mcp/${id}/restart`)
    return response.result
  },

  async listTools(id: string) {
    const response = await get<{ tools: Array<Record<string, unknown>> }>(`/mcp/${id}/tools`)
    return response.tools
  },

  async listResources(id: string) {
    const response = await get<{ resources: Array<Record<string, unknown>> }>(`/mcp/${id}/resources`)
    return response.resources
  }
}
