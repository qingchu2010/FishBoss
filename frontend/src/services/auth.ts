import { get, post } from './http'

export interface AuthUser {
  id: string
  username: string
  displayName: string
}

export interface AuthStatusResponse {
  setupRequired: boolean
  authenticated: boolean
  user: AuthUser | null
}

export interface BootstrapPayload {
  username: string
  displayName: string
  password: string
  confirmPassword: string
  bootstrapToken?: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export const authApi = {
  async status(): Promise<AuthStatusResponse> {
    return get<AuthStatusResponse>('/auth/status')
  },

  async bootstrap(data: BootstrapPayload): Promise<{ user: AuthUser }> {
    return post<{ user: AuthUser }>('/auth/bootstrap', data)
  },

  async login(data: LoginPayload): Promise<{ user: AuthUser }> {
    return post<{ user: AuthUser }>('/auth/login', data)
  },

  async logout(): Promise<{ success: boolean }> {
    return post<{ success: boolean }>('/auth/logout')
  },

  async me(): Promise<{ user: AuthUser }> {
    return get<{ user: AuthUser }>('/auth/me')
  },

  async changePassword(data: ChangePasswordPayload): Promise<{ success: boolean }> {
    return post<{ success: boolean }>('/auth/change-password', data)
  }
}