import { get } from './http'

export interface GroupStatus {
  status: 'not_implemented' | 'planned' | 'in_development' | 'partially_implemented'
  message: string
  featureDescription: string
  estimatedVersion?: string
  data?: null
}

export const groupsApi = {
  async getStatus(): Promise<GroupStatus> {
    return get<GroupStatus>('/group/status')
  }
}
