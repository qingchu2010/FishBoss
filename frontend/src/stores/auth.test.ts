import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'
import { authApi } from '@/services/auth'

vi.mock('@/services/auth', () => ({
  authApi: {
    status: vi.fn(),
    bootstrap: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    changePassword: vi.fn()
  }
}))

function createAuthError(code: string, message: string): { response: { data: { error: { code: string; message: string } } } } {
  return {
    response: {
      data: {
        error: {
          code,
          message
        }
      }
    }
  }
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('keeps setup state when bootstrap token is wrong', async () => {
    const store = useAuthStore()
    store.status = 'setup_required'
    vi.mocked(authApi.bootstrap).mockRejectedValue(createAuthError('AUTH_BOOTSTRAP_TOKEN_INVALID', 'Invalid bootstrap token'))

    const result = await store.bootstrap({
      username: 'admin',
      displayName: 'Admin',
      password: 'password123',
      confirmPassword: 'password123',
      bootstrapToken: 'wrong-token'
    })

    expect(result).toBe(false)
    expect(store.status).toBe('setup_required')
    expect(store.sessionExpired).toBe(false)
    expect(store.authErrorCode).toBe('AUTH_BOOTSTRAP_TOKEN_INVALID')
  })

  it('keeps login page state when password is wrong', async () => {
    const store = useAuthStore()
    store.status = 'unauthenticated'
    vi.mocked(authApi.login).mockRejectedValue(createAuthError('AUTH_INVALID_CREDENTIALS', 'Invalid username or password'))

    const result = await store.login({
      username: 'admin',
      password: 'wrong-password'
    })

    expect(result).toBe(false)
    expect(store.status).toBe('unauthenticated')
    expect(store.sessionExpired).toBe(false)
    expect(store.authErrorCode).toBe('AUTH_INVALID_CREDENTIALS')
  })

  it('keeps authenticated state when current password is wrong', async () => {
    const store = useAuthStore()
    store.status = 'authenticated'
    store.user = {
      id: 'admin_1',
      username: 'admin',
      displayName: 'Admin'
    }
    vi.mocked(authApi.changePassword).mockRejectedValue(createAuthError('AUTH_INVALID_CREDENTIALS', 'Current password is incorrect'))

    const result = await store.changePassword({
      currentPassword: 'wrong-password',
      newPassword: 'new-password-123',
      confirmPassword: 'new-password-123'
    })

    expect(result).toBe(false)
    expect(store.status).toBe('authenticated')
    expect(store.user?.username).toBe('admin')
    expect(store.sessionExpired).toBe(false)
    expect(store.authErrorCode).toBe('AUTH_INVALID_CREDENTIALS')
  })
})
