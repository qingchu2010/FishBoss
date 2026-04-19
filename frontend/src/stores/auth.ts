import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, type AuthUser, type BootstrapPayload, type LoginPayload, type ChangePasswordPayload } from '@/services/auth'
import { setAuthUnauthorizedHandler, getApiErrorCode, getApiErrorMessage, isSessionAuthError } from '@/services/http'
import { useI18n } from '@/i18n'

export type AuthStatus = 'checking' | 'setup_required' | 'unauthenticated' | 'authenticated'

export const useAuthStore = defineStore('auth', () => {
  const { t } = useI18n()

  const status = ref<AuthStatus>('checking')
  const user = ref<AuthUser | null>(null)
  const isSubmitting = ref(false)
  const authError = ref<string | null>(null)
  const authErrorCode = ref<string | null>(null)
  const sessionExpired = ref(false)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  setAuthUnauthorizedHandler(handleUnauthorized)

  async function initialize(): Promise<void> {
    status.value = 'checking'
    authError.value = null
    authErrorCode.value = null
    sessionExpired.value = false
    await refreshStatus()
  }

  async function refreshStatus(): Promise<void> {
    try {
      const response = await authApi.status()
      authErrorCode.value = null
      if (response.setupRequired) {
        status.value = 'setup_required'
        user.value = null
      } else if (response.authenticated && response.user) {
        status.value = 'authenticated'
        user.value = response.user
      } else {
        status.value = 'unauthenticated'
        user.value = null
      }
    } catch {
      authErrorCode.value = null
      status.value = 'unauthenticated'
      user.value = null
    }
  }

  async function bootstrap(payload: BootstrapPayload): Promise<boolean> {
    isSubmitting.value = true
    authError.value = null
    authErrorCode.value = null
    sessionExpired.value = false

    try {
      const response = await authApi.bootstrap(payload)
      user.value = response.user
      sessionExpired.value = false
      status.value = 'authenticated'
      return true
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string }
      const errorCode = getApiErrorCode(error.response?.data)
      authErrorCode.value = errorCode
      if (isSessionAuthError(errorCode)) {
        sessionExpired.value = true
        status.value = 'unauthenticated'
        authError.value = t('auth.sessionExpired')
      } else {
        authError.value = getApiErrorMessage(error.response?.data) || error.message || t('auth.bootstrapFailed')
      }
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  async function login(payload: LoginPayload): Promise<boolean> {
    isSubmitting.value = true
    authError.value = null
    authErrorCode.value = null
    sessionExpired.value = false

    try {
      const response = await authApi.login(payload)
      user.value = response.user
      sessionExpired.value = false
      status.value = 'authenticated'
      return true
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string }
      const errorCode = getApiErrorCode(error.response?.data)
      authErrorCode.value = errorCode
      if (isSessionAuthError(errorCode)) {
        sessionExpired.value = true
        status.value = 'unauthenticated'
        authError.value = t('auth.sessionExpired')
      } else {
        authError.value = getApiErrorMessage(error.response?.data) || t('auth.loginFailed')
      }
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch (error) {
      console.error('Logout request failed', error)
    }
    user.value = null
    authErrorCode.value = null
    status.value = 'unauthenticated'
  }

  async function fetchMe(): Promise<void> {
    try {
      const response = await authApi.me()
      user.value = response.user
      authErrorCode.value = null
      status.value = 'authenticated'
    } catch {
      user.value = null
      authErrorCode.value = null
      status.value = 'unauthenticated'
    }
  }

  function handleUnauthorized(): void {
    user.value = null
    sessionExpired.value = true
    authErrorCode.value = 'AUTH_SESSION_INVALID'
    authError.value = t('auth.sessionExpired')
    status.value = 'unauthenticated'
  }

  async function changePassword(payload: ChangePasswordPayload): Promise<boolean> {
    isSubmitting.value = true
    authError.value = null
    authErrorCode.value = null

    try {
      await authApi.changePassword(payload)
      sessionExpired.value = false
      return true
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown } }
      authErrorCode.value = getApiErrorCode(error.response?.data)
      authError.value = getApiErrorMessage(error.response?.data) || t('auth.changePasswordFailed')
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    status,
    user,
    isSubmitting,
    authError,
    authErrorCode,
    sessionExpired,
    isAuthenticated,
    initialize,
    refreshStatus,
    bootstrap,
    login,
    logout,
    fetchMe,
    handleUnauthorized,
    changePassword
  }
})
