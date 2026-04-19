import { defineStore } from 'pinia'
import { ref } from 'vue'
import { agentsApi, type Agent, type AgentInput } from '@/services/agents'

export { type Agent }

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const currentAgent = ref<Agent | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAgents(force = false) {
    if (!force && agents.value.length > 0) {
      return agents.value
    }
    isLoading.value = true
    error.value = null
    try {
      agents.value = await agentsApi.list()
      return agents.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch agents'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchAgent(id: string) {
    isLoading.value = true
    error.value = null
    try {
      currentAgent.value = await agentsApi.get(id)
      return currentAgent.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch agent'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function setCurrentAgent(agent: Agent | null) {
    currentAgent.value = agent
  }

  async function createAgent(data: AgentInput) {
    const agent = await agentsApi.create(data)
    agents.value.unshift(agent)
    return agent
  }

  async function updateAgent(id: string, data: Partial<AgentInput>) {
    const agent = await agentsApi.update(id, data)
    const index = agents.value.findIndex((item) => item.id === id)
    if (index !== -1) {
      agents.value[index] = agent
    }
    if (currentAgent.value?.id === id) {
      currentAgent.value = agent
    }
    return agent
  }

  async function deleteAgent(id: string) {
    await agentsApi.remove(id)
    agents.value = agents.value.filter((agent) => agent.id !== id)
    if (currentAgent.value?.id === id) {
      currentAgent.value = null
    }
  }

  return {
    agents,
    currentAgent,
    isLoading,
    error,
    fetchAgents,
    fetchAgent,
    setCurrentAgent,
    createAgent,
    updateAgent,
    deleteAgent
  }
})
