import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'

export type ToolCapability = 'full_access' | 'web_retrieval' | 'none'

export interface Agent {
  id: string
  name: string
  modelId: string
  isCallable: boolean
  prompt: string
  description?: string
  enabled: boolean
  createdAt: number
  toolCapability: ToolCapability
}

const DEFAULT_AGENT: Agent = {
  id: 'fishboss_default',
  name: 'FishBoss',
  modelId: '',
  isCallable: true,
  prompt: '',
  description: 'The default FishBoss assistant agent.',
  enabled: true,
  createdAt: Date.now(),
  toolCapability: 'full_access'
}

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const activeAgentId = ref<string | null>(null)
  const isLoading = ref(false)

  const activeAgent = computed(() => {
    return agents.value.find(a => a.id === activeAgentId.value)
  })

  const enabledAgents = computed(() => {
    return agents.value.filter(a => a.enabled)
  })

  async function loadFromApi() {
    isLoading.value = true
    try {
      const data = await api.getAgents()
      agents.value = data.agents || []
      activeAgentId.value = data.activeAgentId || agents.value[0]?.id || null
      if (agents.value.length === 0) {
        const defaultAgent = { ...DEFAULT_AGENT }
        agents.value.push(defaultAgent)
        activeAgentId.value = defaultAgent.id
        await saveToApi()
      }
    } catch (error) {
      console.error('Failed to load agents:', error)
      if (agents.value.length === 0) {
        const defaultAgent = { ...DEFAULT_AGENT }
        agents.value.push(defaultAgent)
        activeAgentId.value = defaultAgent.id
      }
    } finally {
      isLoading.value = false
    }
  }

  async function saveToApi() {
    try {
      await api.saveAgents({
        agents: agents.value,
        activeAgentId: activeAgentId.value
      })
    } catch (error) {
      console.error('Failed to save agents:', error)
    }
  }

  function addAgent(agent: Omit<Agent, 'id' | 'createdAt'>): Agent {
    const newAgent: Agent = {
      ...agent,
      id: Math.random().toString(36).substring(2),
      createdAt: Date.now()
    }
    agents.value.push(newAgent)
    saveToApi()
    return newAgent
  }

  function updateAgent(id: string, updates: Partial<Agent>) {
    const agent = agents.value.find(a => a.id === id)
    if (agent) {
      Object.assign(agent, updates)
      saveToApi()
    }
  }

  function deleteAgent(id: string) {
    const index = agents.value.findIndex(a => a.id === id)
    if (index !== -1) {
      agents.value.splice(index, 1)
      if (activeAgentId.value === id) {
        activeAgentId.value = agents.value[0]?.id || null
      }
      saveToApi()
    }
  }

  function getAgent(id: string): Agent | undefined {
    return agents.value.find(a => a.id === id)
  }

  function setActiveAgent(id: string) {
    activeAgentId.value = id
    saveToApi()
  }

  async function init() {
    await loadFromApi()
  }

  return {
    agents,
    activeAgentId,
    activeAgent,
    enabledAgents,
    isLoading,
    loadFromApi,
    addAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    setActiveAgent,
    init
  }
})