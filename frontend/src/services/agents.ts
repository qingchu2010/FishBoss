import { del, get, post } from './http'

export interface Agent {
  id: string
  name: string
  description: string
  instructions: string
  tools: string[]
  toolPermissions?: {
    allowedTools?: string[]
    deniedTools?: string[]
  }
  model?: string
  provider?: string
  settings?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentInput {
  name: string
  description?: string
  instructions: string
  tools?: string[]
  toolPermissions?: Agent['toolPermissions']
  model?: string
  provider?: string
  settings?: Record<string, unknown>
}

export const agentsApi = {
  async list(): Promise<Agent[]> {
    const response = await get<{ agents: Agent[] }>('/agents')
    return response.agents
  },

  async get(id: string): Promise<Agent> {
    const response = await get<{ agent: Agent }>(`/agents/${id}`)
    return response.agent
  },

  async create(data: AgentInput): Promise<Agent> {
    const response = await post<{ agent: Agent }>('/agents', data)
    return response.agent
  },

  async update(id: string, data: Partial<AgentInput>): Promise<Agent> {
    const response = await post<{ agent: Agent }>(`/agents/${id}`, data, 'PATCH')
    return response.agent
  },

  async remove(id: string): Promise<void> {
    await del(`/agents/${id}`)
  },

  async test(agentId: string, message: string) {
    const response = await post<{ result: Record<string, unknown> }>('/agents/test', { agentId, message })
    return response.result
  }
}
