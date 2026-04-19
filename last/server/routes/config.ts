import { Router } from 'express'
import { readConfigFile, writeConfigFile, getConfigDir, getProviderApiKey, setProviderApiKey, deleteAllProviderApiKeys } from '../storage/index.js'

export const configRouter = Router()

interface Provider {
  id: string
  apiKey?: string
  [key: string]: unknown
}

configRouter.get('/providers', async (req, res) => {
  const data = readConfigFile('providers.json')
  if (!data) {
    res.json({ providers: [], activeProviderId: null })
    return
  }
  const providersWithKeys = await Promise.all(
    (data.providers ?? []).map(async (provider: Provider) => {
      const { apiKey: _apiKey, ...rest } = provider
      const hasApiKey = Boolean(await getProviderApiKey(provider.id))
      return { ...rest, hasApiKey }
    })
  )
  res.json({ providers: providersWithKeys, activeProviderId: data.activeProviderId })
})

configRouter.put('/providers', async (req, res) => {
  const providers: Provider[] = req.body.providers ?? []
  const activeProviderId: string | null = req.body.activeProviderId ?? null

  const previousData = readConfigFile('providers.json')
  const previousProviderIds = previousData?.providers?.map((p: Provider) => p.id) ?? []
  const currentProviderIds = providers.map(p => p.id)
  const removedProviderIds = previousProviderIds.filter((id: string) => !currentProviderIds.includes(id))

  if (removedProviderIds.length > 0) {
    await deleteAllProviderApiKeys(removedProviderIds)
  }

  const providersToSave: Provider[] = []
  for (const provider of providers) {
    const { apiKey, ...rest } = provider
    if (apiKey) {
      await setProviderApiKey(provider.id, apiKey)
    }
    providersToSave.push({ ...rest, id: provider.id } as Provider)
  }

  const success = writeConfigFile('providers.json', { providers: providersToSave, activeProviderId })
  res.json({ success })
})

configRouter.get('/app', (req, res) => {
  const data = readConfigFile('app.json')
  res.json(data || { theme: 'dark', locale: 'zh_CN' })
})

configRouter.put('/app', (req, res) => {
  const success = writeConfigFile('app.json', req.body)
  res.json({ success })
})

interface RateLimitConfig {
  windowMs: number
  max: number
  chatMax: number
  enabled: boolean
}

configRouter.get('/rate-limit', (req, res) => {
  const data = readConfigFile('rate-limit.json')
  const defaultConfig: RateLimitConfig = {
    windowMs: 60000,
    max: 100,
    chatMax: 30,
    enabled: true
  }
  res.json(data || defaultConfig)
})

configRouter.put('/rate-limit', (req, res) => {
  const config: RateLimitConfig = {
    windowMs: Math.max(1000, parseInt(req.body.windowMs) || 60000),
    max: Math.max(1, parseInt(req.body.max) || 100),
    chatMax: Math.max(1, parseInt(req.body.chatMax) || 30),
    enabled: Boolean(req.body.enabled)
  }
  const success = writeConfigFile('rate-limit.json', config)
  res.json({ success, config })
})

configRouter.get('/dir', (req, res) => {
  res.json({ path: getConfigDir() })
})

configRouter.get('/agents', (req, res) => {
  const data = readConfigFile('agents.json')
  res.json(data || { agents: [], activeAgentId: null })
})

configRouter.put('/agents', (req, res) => {
  const success = writeConfigFile('agents.json', req.body)
  res.json({ success })
})
