import { get, post, del } from './http'

export type PlatformType = 'qq' | 'wechat' | 'telegram' | 'discord' | 'slack' | 'onebot' | 'custom'

export interface PlatformCapabilities {
  supportsConnectionTest: boolean
  supportsMessaging: boolean
}

export interface PlatformModuleFieldOption {
  label: string
  value: string
}

export interface PlatformModuleFieldDefinition {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'select'
  required?: boolean
  placeholder?: string
  options?: PlatformModuleFieldOption[]
}

export interface PlatformModuleDefinition {
  id: string
  title: string
  description: string
  enabledByDefault?: boolean
  capabilities: PlatformCapabilities
  fields: PlatformModuleFieldDefinition[]
}

export interface Platform {
  id: string
  name: string
  platformType: PlatformType
  config: Record<string, unknown>
  enabled: boolean
  credentialsMasked: string
  createdAt: string
  updatedAt: string
}

export interface PlatformDetail extends Platform {
  connectionStatus?: {
    success: boolean
    error?: string
    info?: Record<string, unknown>
  }
}

export interface CreatePlatformData {
  name: string
  platformType: PlatformType
  config: Record<string, unknown>
  credentials?: string
  enabled?: boolean
}

export interface UpdatePlatformData {
  name?: string
  platformType?: PlatformType
  config?: Record<string, unknown>
  credentials?: string | null
  enabled?: boolean
}

export interface SendMessageData {
  target: string
  message: {
    content?: string
    msg_type?: number
    [key: string]: unknown
  }
}

export interface PlatformMetadata {
  type: PlatformType
  displayName: string
  defaultConfig: Record<string, unknown>
  modules: PlatformModuleDefinition[]
  capabilities: PlatformCapabilities
}

export const platformsApi = {
  async list(): Promise<Platform[]> {
    return get<Platform[]>('/platform')
  },

  async getMetadata(): Promise<{ platformTypes: PlatformMetadata[] }> {
    return get<{ platformTypes: PlatformMetadata[] }>('/platform/metadata')
  },

  async get(id: string): Promise<PlatformDetail | null> {
    return get<PlatformDetail>(`/platform/${id}`)
  },

  async create(data: CreatePlatformData): Promise<Platform> {
    return post<Platform>('/platform', data)
  },

  async update(id: string, data: UpdatePlatformData): Promise<Platform> {
    return post<Platform>(`/platform/${id}`, data, 'PATCH')
  },

  async delete(id: string): Promise<void> {
    await del(`/platform/${id}`)
  },

  async testConnection(id: string): Promise<{ success: boolean; error?: string; info?: Record<string, unknown> }> {
    return post<{ success: boolean; error?: string; info?: Record<string, unknown> }>(`/platform/${id}/test`)
  },

  async sendMessage(id: string, target: string, message: SendMessageData['message']): Promise<{ messageId: string; timestamp: number }> {
    return post<{ messageId: string; timestamp: number }>(`/platform/${id}/send`, { target, message })
  },

  async getPlatformMetadata(id: string): Promise<Record<string, unknown>> {
    return get<Record<string, unknown>>(`/platform/${id}/platform-metadata`)
  }
}
