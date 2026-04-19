import { defineStore } from 'pinia'
import { ref } from 'vue'
import { mcpApi, type MCPServer } from '@/services/mcp'

export { type MCPServer }

export const useMCPStore = defineStore('mcp', () => {
  const servers = ref<MCPServer[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchServers() {
    isLoading.value = true
    error.value = null
    try {
      servers.value = await mcpApi.listServers()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch MCP servers'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function createServer(data: Pick<MCPServer, 'name' | 'command' | 'args' | 'env' | 'enabled'>) {
    const server = await mcpApi.createServer(data)
    servers.value.push(server)
    return server
  }

  async function updateServer(id: string, data: Partial<Pick<MCPServer, 'name' | 'command' | 'args' | 'env' | 'enabled'>>) {
    const server = await mcpApi.updateServer(id, data)
    const index = servers.value.findIndex((item) => item.id === id)
    if (index !== -1) {
      servers.value[index] = server
    }
    return server
  }

  async function deleteServer(id: string) {
    await mcpApi.deleteServer(id)
    servers.value = servers.value.filter((server) => server.id !== id)
  }

  return {
    servers,
    isLoading,
    error,
    fetchServers,
    createServer,
    updateServer,
    deleteServer
  }
})
