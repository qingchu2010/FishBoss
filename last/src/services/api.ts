import axios from 'axios'

const API_BASE = '/api'

type AskAnswer =
  | string
  | string[]
  | {
      type: 'custom' | 'single' | 'multi'
      value: string | string[]
    }
  | {
      type: 'multi_step'
      value: Array<{
        question: string
        answerType: 'custom' | 'single' | 'multi'
        answer: string | string[]
      }>
    }

interface SessionState {
  sessionId: string
  status: 'idle' | 'streaming' | 'paused' | 'completed' | 'error'
  contextUsage?: { used: number; limit: number }
}

export const api = {
  async getProviders() {
    const response = await axios.get(`${API_BASE}/config/providers`)
    return response.data
  },

  async saveProviders(data: unknown) {
    const response = await axios.put(`${API_BASE}/config/providers`, data)
    return response.data
  },

  async getAppConfig() {
    const response = await axios.get(`${API_BASE}/config/app`)
    return response.data
  },

  async saveAppConfig(data: unknown) {
    const response = await axios.put(`${API_BASE}/config/app`, data)
    return response.data
  },

  async getConfigDir() {
    const response = await axios.get(`${API_BASE}/config/dir`)
    return response.data
  },

  async fetchModels(type: string, baseUrl: string) {
    const response = await axios.post(`${API_BASE}/provider/fetch-models`, {
      type,
      baseUrl
    })
    return response.data
  },

  async getProviderList() {
    const response = await axios.get(`${API_BASE}/provider/list`)
    return response.data
  },

  async testConnection(type: string, baseUrl: string) {
    const response = await axios.post(`${API_BASE}/provider/test-connection`, {
      type,
      baseUrl
    })
    return response.data
  },

  async testProviderConnection(providerId: string) {
    const response = await axios.post(`${API_BASE}/provider/test-provider/${providerId}`)
    return response.data
  },

  async getTools() {
    const response = await axios.get(`${API_BASE}/tools/list`)
    return response.data
  },

  async executeTool(
    toolId: string,
    args: Record<string, unknown>,
    workingDirectory?: string,
    sessionId?: string,
    signal?: AbortSignal
  ) {
    const response = await axios.post(`${API_BASE}/tools/execute`, {
      toolId,
      args,
      workingDirectory,
      sessionId
    }, {
      signal
    })
    return response.data
  },

  async abortToolExecution(executionId?: string, sessionId?: string) {
    const response = await axios.post(`${API_BASE}/tools/abort`, {
      executionId,
      sessionId
    })
    return response.data
  },

  async getRunningTools(sessionId?: string) {
    const url = sessionId 
      ? `${API_BASE}/tools/running?sessionId=${sessionId}`
      : `${API_BASE}/tools/running`
    const response = await axios.get(url)
    return response.data
  },

  async getTodos(sessionId?: string) {
    const url = sessionId
      ? `${API_BASE}/tools/todos/status?sessionId=${encodeURIComponent(sessionId)}`
      : `${API_BASE}/tools/todos/status`
    const response = await axios.get(url)
    return response.data
  },

  async clearTodos(sessionId?: string) {
    const response = await axios.post(`${API_BASE}/tools/todos/clear`, { sessionId })
    return response.data
  },

  async getPendingAsk(sessionId?: string) {
    const url = sessionId 
      ? `${API_BASE}/tools/ask/pending?sessionId=${sessionId}`
      : `${API_BASE}/tools/ask/pending`
    const response = await axios.get(url)
    return response.data
  },

  async resolveAsk(askId: string, answer: AskAnswer) {
    const response = await axios.post(`${API_BASE}/tools/ask/respond`, {
      askId,
      answer
    })
    return response.data
  },

  async cancelAsk(askId: string) {
    const response = await axios.post(`${API_BASE}/tools/ask/cancel`, {
      askId
    })
    return response.data
  },

  async cancelSessionAsks(sessionId: string) {
    const response = await axios.post(`${API_BASE}/tools/ask/cancel-session`, {
      sessionId
    })
    return response.data
  },

  async getAgents() {
    const response = await axios.get(`${API_BASE}/config/agents`)
    return response.data
  },

  async saveAgents(data: unknown) {
    const response = await axios.put(`${API_BASE}/config/agents`, data)
    return response.data
  },

  async chatCompletion(modelId: string, messages: unknown[], providerId?: string, providerConfig?: unknown, tools?: unknown[], enableTools?: boolean) {
    const response = await axios.post(`${API_BASE}/chat/completion`, {
      modelId,
      messages,
      providerId,
      providerConfig,
      tools,
      enableTools
    })
    return response.data
  },

  async buildSystemPrompt(agentId: string, remindIncompleteTodos?: boolean, sessionId?: string) {
    const response = await axios.post(`${API_BASE}/chat/build-system-prompt`, {
      agentId,
      remindIncompleteTodos,
      sessionId
    })
    return response.data
  },

  streamChat(
    modelId: string,
    messages: unknown[],
    providerId?: string,
    providerConfig?: unknown,
    tools?: unknown[],
    enableTools?: boolean,
    onMessage?: (data: { content?: string; thinking?: string; toolCalls?: unknown[] }) => void,
    onDone?: () => void,
    onError?: (error: string) => void,
    signal?: AbortSignal
  ) {
    let stopped = false
    const stop = () => {
      stopped = true
    }

    signal?.addEventListener('abort', stop, { once: true })

    fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId,
        messages,
        providerId,
        providerConfig,
        tools,
        enableTools
      }),
      signal
    }).then(async response => {
      if (stopped) {
        return
      }
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errorBody = await response.json() as { error?: string }
            errorMessage = errorBody.error || errorMessage
          } else {
            const errorText = (await response.text()).trim()
            if (errorText) {
              errorMessage = errorText
            }
          }
        } catch (e) {
          console.error('Failed to parse stream error response:', e)
        }
        onError?.(errorMessage)
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        onError?.('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (!stopped) {
            onDone?.()
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (stopped) {
            return
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              if (!stopped) {
                onDone?.()
              }
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) {
                if (!stopped) {
                  onError?.(parsed.error)
                }
              } else {
                if (!stopped) {
                  onMessage?.(parsed)
                }
              }
            } catch (e) {
              console.error('Failed to parse stream event payload:', e)
            }
          }
        }
      }
    }).catch(err => {
      if (!stopped && err.name !== 'AbortError') {
        onError?.(err.message)
      }
    }).finally(() => {
      signal?.removeEventListener('abort', stop)
    })
  },

  async getConversations() {
    const response = await axios.get(`${API_BASE}/conversations`)
    return response.data
  },

  async getConversation(id: string) {
    const response = await axios.get(`${API_BASE}/conversations/${id}`)
    return response.data
  },

  async createConversation(title?: string, agentId?: string) {
    const response = await axios.post(`${API_BASE}/conversations`, { title, agentId })
    return response.data
  },

  async updateConversation(id: string, data: { title?: string; messages?: unknown[] }) {
    const response = await axios.put(`${API_BASE}/conversations/${id}`, data)
    return response.data
  },

  async deleteConversation(id: string) {
    const response = await axios.delete(`${API_BASE}/conversations/${id}`)
    return response.data
  },

  async getDashboardStats() {
    const response = await axios.get(`${API_BASE}/dashboard/stats`)
    return response.data
  },

  async getMCPServers() {
    const response = await axios.get(`${API_BASE}/mcp/servers`)
    return response.data
  },

  async addMCPServer(server: { id?: string; name: string; config: unknown }) {
    const response = await axios.post(`${API_BASE}/mcp/servers`, server)
    return response.data
  },

  async saveMCPServers(servers: unknown[]) {
    const response = await axios.put(`${API_BASE}/mcp/servers`, { servers })
    return response.data
  },

  async initializeMCPServer(id: string) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${id}/initialize`)
    return response.data
  },

  async callMCPTool(serverId: string, name: string, args: Record<string, unknown>) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${serverId}/tools/call`, {
      name,
      arguments: args
    })
    return response.data
  },

  async getMCPTools(serverId?: string) {
    const url = serverId
      ? `${API_BASE}/mcp/servers/${serverId}/tools`
      : `${API_BASE}/mcp/tools`
    const response = await axios.get(url)
    return response.data
  },

  async getMCPResources(serverId?: string) {
    const url = serverId
      ? `${API_BASE}/mcp/servers/${serverId}/resources`
      : `${API_BASE}/mcp/resources`
    const response = await axios.get(url)
    return response.data
  },

  async getMCPPrompts(serverId?: string) {
    const url = serverId
      ? `${API_BASE}/mcp/servers/${serverId}/prompts`
      : `${API_BASE}/mcp/prompts`
    const response = await axios.get(url)
    return response.data
  },

  async readMCPResource(serverId: string, uri: string) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${serverId}/resources/read`, {
      uri
    })
    return response.data
  },

  async getMCPPrompt(serverId: string, name: string, args?: Record<string, unknown>) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${serverId}/prompts/get`, {
      name,
      arguments: args || {}
    })
    return response.data
  },

  async deleteMCPServer(id: string) {
    const response = await axios.delete(`${API_BASE}/mcp/servers/${id}`)
    return response.data
  },

  async getMCPAuthStatus(serverId: string) {
    const response = await axios.get(`${API_BASE}/mcp/servers/${serverId}/auth/status`)
    return response.data
  },

  async startMCPAuth(serverId: string) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${serverId}/auth/start`)
    return response.data
  },

  async mcpAuthCallback(serverId: string, code: string, state: string) {
    const response = await axios.post(`${API_BASE}/mcp/servers/${serverId}/auth/callback`, {
      code,
      state
    })
    return response.data
  },

  async removeMCPAuth(serverId: string) {
    const response = await axios.delete(`${API_BASE}/mcp/servers/${serverId}/auth`)
    return response.data
  },

  async getSkills() {
    const response = await axios.get(`${API_BASE}/skill`)
    return response.data
  },

  async getSkill(name: string) {
    const response = await axios.get(`${API_BASE}/skill/${name}`)
    return response.data
  },

  async createSkill(data: { name: string; description: string; content?: string }) {
    const response = await axios.post(`${API_BASE}/skill`, data)
    return response.data
  },

  async updateSkill(name: string, data: { description?: string; content?: string }) {
    const response = await axios.put(`${API_BASE}/skill/${name}`, data)
    return response.data
  },

  async deleteSkill(name: string) {
    const response = await axios.delete(`${API_BASE}/skill/${name}`)
    return response.data
  },

  async getSkillDirs() {
    const response = await axios.get(`${API_BASE}/skill/dirs`)
    return response.data
  },

  async importSkills(url: string) {
    const response = await axios.post(`${API_BASE}/skill/import`, { url })
    return response.data
  },

  async importSkillsFromZip(data: string) {
    const response = await axios.post(`${API_BASE}/skill/import-zip`, { data })
    return response.data
  },

  async getRateLimitConfig() {
    const response = await axios.get(`${API_BASE}/config/rate-limit`)
    return response.data
  },

  async saveRateLimitConfig(data: { windowMs: number; max: number; chatMax: number; enabled: boolean }) {
    const response = await axios.put(`${API_BASE}/config/rate-limit`, data)
    return response.data
  },

  async reloadRateLimitConfig() {
    const response = await axios.post(`${API_BASE}/config/rate-limit/reload`)
    return response.data
  },

  agentStreamStart(
    agentId: string,
    message: string,
    options?: {
      sessionId?: string
      modelId?: string
      providerId?: string
      tools?: unknown[]
      enableTools?: boolean
    },
    callbacks?: {
      onMessage?: (data: { content?: string; thinking?: string; toolCalls?: unknown[] }) => void
      onDone?: () => void
      onError?: (error: string) => void
    }
  ) {
    let stopped = false
    const stop = () => {
      stopped = true
    }

    const { signal } = new AbortController()

    fetch(`${API_BASE}/agent/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agentId,
        message,
        sessionId: options?.sessionId,
        modelId: options?.modelId,
        providerId: options?.providerId,
        tools: options?.tools,
        enableTools: options?.enableTools
      }),
      signal
    }).then(async response => {
      if (stopped) {
        return
      }
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errorBody = await response.json() as { error?: string }
            errorMessage = errorBody.error || errorMessage
          } else {
            const errorText = (await response.text()).trim()
            if (errorText) {
              errorMessage = errorText
            }
          }
        } catch (e) {
          console.error('Failed to parse stream error response:', e)
        }
        callbacks?.onError?.(errorMessage)
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        callbacks?.onError?.('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (!stopped) {
            callbacks?.onDone?.()
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (stopped) {
            return
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              if (!stopped) {
                callbacks?.onDone?.()
              }
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) {
                if (!stopped) {
                  callbacks?.onError?.(parsed.error)
                }
              } else {
                if (!stopped) {
                  callbacks?.onMessage?.(parsed)
                }
              }
            } catch (e) {
              console.error('Failed to parse stream event payload:', e)
            }
          }
        }
      }
    }).catch(err => {
      if (!stopped && err.name !== 'AbortError') {
        callbacks?.onError?.(err.message)
      }
    })

    return { stop }
  },

  async agentStreamStop(sessionId: string): Promise<void> {
    const response = await axios.delete(`${API_BASE}/agent/stream/${sessionId}`)
    return response.data
  },

  async agentSubmitAskResponse(sessionId: string, askId: string, answer: AskAnswer): Promise<void> {
    const response = await axios.post(`${API_BASE}/agent/session/${sessionId}/respond`, {
      askId,
      answer
    })
    return response.data
  },

  async agentGetSession(sessionId: string): Promise<SessionState> {
    const response = await axios.get(`${API_BASE}/agent/session/${sessionId}`)
    return response.data
  }
}
