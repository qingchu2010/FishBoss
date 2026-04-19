import { get } from './http'

export interface HealthCheck {
  status: 'ok'
  version: string
  timestamp: string
}

export interface SystemStats {
  uptime: number
  memory: {
    heapUsed: number
    heapTotal: number
    rss: number
    external: number
  }
  counts: {
    prompts: number
    config: number
    data: number
    auth: number
    logs: number
    media: number
    workflows: number
    providers: number
    mcp: number
    skills: number
    frontendConfig: number
  }
  dashboard: {
    providers: {
      total: number
      enabled: number
      byType: Record<string, { total: number; enabled: number }>
    }
    agents: {
      total: number
    }
    models: {
      total: number
      distribution: Record<string, number>
    }
    system: {
      platform: string
      arch: string
      uptime: number
      memory: {
        total: number
        free: number
      }
      cpus: number
      configDir: string
    }
  }
}

export interface StorageInfo {
  root: string
  paths: {
    prompts: string
    config: string
    data: string
    auth: string
    logs: string
    media: string
    workflows: string
    providers: string
    mcp: string
    skills: string
    frontendConfig: string
  }
  sizes: {
    prompts: number
    config: number
    data: number
    auth: number
    logs: number
    media: number
    workflows: number
    providers: number
    mcp: number
    skills: number
    frontendConfig: number
  }
}

export const systemApi = {
  async health(): Promise<HealthCheck> {
    return get<HealthCheck>('/system/health')
  },

  async getStats(): Promise<SystemStats> {
    return get<SystemStats>('/system/stats')
  },

  async getStorage(): Promise<StorageInfo> {
    return get<StorageInfo>('/system/storage')
  }
}
