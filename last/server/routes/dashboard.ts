import { Router } from 'express'
import { readConfigFile } from '../storage/index.js'
import os from 'os'

export const dashboardRouter = Router()

dashboardRouter.get('/stats', (req, res) => {
  const providersData = readConfigFile('providers.json')
  const agentsData = readConfigFile('agents.json')
  const appData = readConfigFile('app.json')

  const providers = providersData?.providers || []
  const agents = agentsData?.agents || []

  const enabledProviders = providers.filter((p: any) => p.enabled !== false)
  const totalModels = providers.reduce((sum: number, p: any) => sum + (p.selectedModels?.length || 0), 0)

  const modelDistribution = providers.reduce((acc: Record<string, number>, p: any) => {
    const type = p.type || 'custom'
    acc[type] = (acc[type] || 0) + (p.selectedModels?.length || 0)
    return acc
  }, {})

  const providerTypeStats = providers.reduce((acc: Record<string, { total: number; enabled: number }>, p: any) => {
    const type = p.type || 'custom'
    if (!acc[type]) {
      acc[type] = { total: 0, enabled: 0 }
    }
    acc[type].total++
    if (p.enabled !== false) {
      acc[type].enabled++
    }
    return acc
  }, {})

  res.json({
    providers: {
      total: providers.length,
      enabled: enabledProviders.length,
      byType: providerTypeStats
    },
    agents: {
      total: agents.length
    },
    models: {
      total: totalModels,
      distribution: modelDistribution
    },
    system: {
      platform: process.platform,
      arch: os.arch(),
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      },
      cpus: os.cpus().length,
      theme: appData?.theme || 'dark',
      locale: appData?.locale || 'zh_CN',
      configDir: `${os.homedir()}/.fishboss`
    }
  })
})
