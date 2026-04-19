import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toolsApi, type ToolkitTool } from '@/services/tools'

export { type ToolkitTool }

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<ToolkitTool[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTools() {
    if (tools.value.length > 0) {
      return tools.value
    }

    if (isLoading.value) {
      return tools.value
    }

    isLoading.value = true
    error.value = null
    try {
      tools.value = await toolsApi.list()
      return tools.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch tools'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  return {
    tools,
    isLoading,
    error,
    fetchTools
  }
})
