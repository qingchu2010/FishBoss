import { Router } from 'express'
import type { ProviderType } from '../types/index.js'
import { PROVIDER_INFO, getDefaultCapabilities } from '../types/index.js'
import { readConfigFile, getProviderApiKey } from '../storage/index.js'

export const providerRouter = Router()

providerRouter.post('/fetch-models', async (req, res) => {
  const { type, baseUrl, apiKey } = req.body

  if (!baseUrl || !apiKey) {
    res.status(400).json({ error: 'Base URL and API Key are required' })
    return
  }

  try {
    const models = await fetchModels(type as ProviderType, baseUrl, apiKey)
    res.json({ models })
  } catch (error) {
    console.error('Failed to fetch models:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Network error' })
  }
})

providerRouter.post('/test-connection', async (req, res) => {
  const { type, baseUrl, apiKey } = req.body

  if (!baseUrl || !apiKey) {
    res.status(400).json({ success: false, error: 'Base URL and API Key are required' })
    return
  }

  try {
    const result = await testConnection(type as ProviderType, baseUrl, apiKey)
    res.json(result)
  } catch (error) {
    res.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Network error' 
    })
  }
})

providerRouter.post('/test-provider/:id', async (req, res) => {
  const { id } = req.params
  
  try {
    const config = readConfigFile('providers.json')
    const provider = config?.providers?.find((p: any) => p.id === id)
    
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found' })
    }

    const apiKey = await getProviderApiKey(id)
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API Key not configured' })
    }

    const result = await testConnection(provider.type, provider.baseUrl, apiKey)
    res.json(result)
  } catch (error) {
    res.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Network error' 
    })
  }
})

providerRouter.get('/list', (req, res) => {
  const providers = Object.values(PROVIDER_INFO).map(info => ({
    id: info.id,
    name: info.name,
    type: info.type,
    baseUrl: info.baseUrl,
    envKey: info.envKey,
    defaultModels: info.defaultModels
  }))
  res.json({ providers })
})

async function fetchModels(type: ProviderType, baseUrl: string, apiKey: string): Promise<string[]> {
  switch (type) {
    case 'openai':
    case 'deepseek':
    case 'moonshot':
    case 'zhipu':
    case 'custom': {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json() as { data?: { id: string }[] }
      return data.data?.map((m) => m.id) || []
    }

    case 'anthropic': {
      return PROVIDER_INFO.anthropic.defaultModels || []
    }

    case 'gemini': {
      const response = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json() as { models?: { name: string }[] }
      return data.models?.map((m) => m.name.replace('models/', '')) || []
    }

    case 'minimax': {
      const response = await fetch(`${baseUrl}/v1/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'MiniMax-M2',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        })
      })
      if (!response.ok) {
        const errorData = await response.json() as { 
          base_resp?: { status_msg?: string }
          error?: { message?: string } 
        }
        throw new Error(errorData.base_resp?.status_msg || errorData.error?.message || `HTTP ${response.status}`)
      }
      return PROVIDER_INFO.minimax.defaultModels || []
    }

    case 'alibaba': {
      return PROVIDER_INFO.alibaba.defaultModels || []
    }

    case 'baidu': {
      return PROVIDER_INFO.baidu.defaultModels || []
    }

    default:
      return PROVIDER_INFO[type]?.defaultModels || []
  }
}

async function testConnection(
  type: ProviderType, 
  baseUrl: string, 
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  switch (type) {
    case 'openai':
    case 'deepseek':
    case 'moonshot':
    case 'zhipu':
    case 'custom': {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (response.ok) {
        return { success: true }
      }
      const errorData = await response.json() as { error?: { message?: string } }
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` }
    }

    case 'anthropic': {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      })
      if (response.ok) {
        return { success: true }
      }
      const errorData = await response.json() as { error?: { message?: string } }
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` }
    }

    case 'gemini': {
      const response = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`)
      if (response.ok) {
        return { success: true }
      }
      const errorData = await response.json() as { error?: { message?: string } }
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` }
    }

    case 'minimax': {
      const response = await fetch(`${baseUrl}/v1/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'MiniMax-M2',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        })
      })
      if (response.ok) {
        return { success: true }
      }
      const errorData = await response.json() as { 
        base_resp?: { status_msg?: string }
        error?: { message?: string } 
      }
      return { 
        success: false, 
        error: errorData.base_resp?.status_msg || errorData.error?.message || `HTTP ${response.status}` 
      }
    }

    default:
      return { success: false, error: 'Unknown provider type' }
  }
}
