import { get, post } from './http'

export interface FrontendConfig {
  theme?: 'dark' | 'light'
  locale?: 'zh_CN' | 'en'
  allowToolPathsOutsideWorkspace?: boolean
  maxToolLoopIterations?: number
  toolLoopLimitEnabled?: boolean
}

export const frontendConfigApi = {
  async get(): Promise<FrontendConfig> {
    const response = await get<{ config: FrontendConfig }>('/frontend-config')
    return response.config
  },

  async update(data: FrontendConfig): Promise<FrontendConfig> {
    const response = await post<{ config: FrontendConfig }>('/frontend-config', data, 'PATCH')
    return response.config
  }
}
