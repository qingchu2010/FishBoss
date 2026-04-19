import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'

export interface McpLocalConfig {
  type: 'local'
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
}

export interface McpRemoteConfig {
  type: 'remote'
  url: string
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  enabled?: boolean
  timeout?: number
}

export type McpConfig = McpLocalConfig | McpRemoteConfig

export interface MCPServer {
  id: string
  name: string
  config: McpConfig
  connected?: boolean
  tools?: MCPTool[]
  resources?: MCPResource[]
  prompts?: MCPPrompt[]
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  serverId?: string
  serverName?: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
  serverName: string
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  serverId: string
  serverName: string
}

export interface MCPToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ServerStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'needs_auth'
export type AuthStatus = 'not_authenticated' | 'authenticated' | 'expired'

export interface ServerState {
  status: ServerStatus
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
  authStatus?: AuthStatus
  error?: string
}

export const useMCPStore = defineStore('mcp', () => {
  const servers = ref<MCPServer[]>([])
  const serverStates = ref<Map<string, ServerState>>(new Map())
  const isLoading = ref(false)

  const allTools = computed(() => {
    const tools: MCPTool[] = []
    for (const state of serverStates.value.values()) {
      if (state.status === 'connected') {
        tools.push(...state.tools)
      }
    }
    return tools
  })

  const allResources = computed(() => {
    const resources: MCPResource[] = []
    for (const state of serverStates.value.values()) {
      if (state.status === 'connected') {
        resources.push(...state.resources)
      }
    }
    return resources
  })

  const allPrompts = computed(() => {
    const prompts: MCPPrompt[] = []
    for (const state of serverStates.value.values()) {
      if (state.status === 'connected') {
        prompts.push(...state.prompts)
      }
    }
    return prompts
  })

  const connectedServers = computed(() => {
    return servers.value.filter(s => serverStates.value.get(s.id)?.status === 'connected')
  })

  function addServer(server: Omit<MCPServer, 'id'>) {
    const newServer: MCPServer = {
      ...server,
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2)}`
    }
    servers.value.push(newServer)
    serverStates.value.set(newServer.id, {
      status: 'idle',
      tools: [],
      resources: [],
      prompts: []
    })
    return newServer
  }

  function updateServer(id: string, updates: Partial<MCPServer>) {
    const server = servers.value.find(s => s.id === id)
    if (server) {
      Object.assign(server, updates)
    }
  }

  function removeServer(id: string) {
    servers.value = servers.value.filter(s => s.id !== id)
    serverStates.value.delete(id)
  }

  function setServerState(id: string, state: Partial<ServerState>) {
    const existing = serverStates.value.get(id) || {
      status: 'idle' as ServerStatus,
      tools: [],
      resources: [],
      prompts: []
    }
    serverStates.value.set(id, { ...existing, ...state })
  }

  function getServerState(id: string): ServerState | undefined {
    return serverStates.value.get(id)
  }

  function getToolByName(name: string): MCPTool | undefined {
    return allTools.value.find(t => t.name === name)
  }

  function getResourceByUri(uri: string): MCPResource | undefined {
    return allResources.value.find(r => r.uri === uri)
  }

  function getPromptByName(name: string): MCPPrompt | undefined {
    return allPrompts.value.find(p => p.name === name)
  }

  function clearAll() {
    servers.value = []
    serverStates.value.clear()
  }

  async function loadFromApi() {
    isLoading.value = true
    try {
      const data = await api.getMCPServers()
      servers.value = data.servers || []
      for (const s of servers.value) {
        if (s.connected) {
          setServerState(s.id, {
            status: 'connected',
            tools: (s.tools || []).map((t: MCPTool) => ({ ...t, serverId: s.id, serverName: s.name })),
            resources: (s.resources || []).map((r: MCPResource) => ({ ...r, serverId: s.id, serverName: s.name })),
            prompts: (s.prompts || []).map((p: MCPPrompt) => ({ ...p, serverId: s.id, serverName: s.name }))
          })
        } else {
          setServerState(s.id, { status: 'idle', tools: [], resources: [], prompts: [] })
        }
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function init() {
    await loadFromApi()
  }

  return {
    servers,
    serverStates,
    isLoading,
    allTools,
    allResources,
    allPrompts,
    connectedServers,
    addServer,
    updateServer,
    removeServer,
    setServerState,
    getServerState,
    getToolByName,
    getResourceByUri,
    getPromptByName,
    clearAll,
    loadFromApi,
    init
  }
})
