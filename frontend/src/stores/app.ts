import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { frontendConfigApi } from '@/services/frontend-config'

const DEFAULT_THEME: 'dark' | 'light' = 'dark'
const DEFAULT_MAX_TOOL_LOOP_ITERATIONS = 8

type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface NotificationItem {
  id: number
  message: string
  title?: string
  type: NotificationType
  duration: number
  showProgress: boolean
}

export const useAppStore = defineStore('app', () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const sidebarCollapsed = ref(false)
  const theme = ref<'dark' | 'light'>(DEFAULT_THEME)
  const allowToolPathsOutsideWorkspace = ref(false)
  const maxToolLoopIterations = ref(DEFAULT_MAX_TOOL_LOOP_ITERATIONS)
  const toolLoopLimitEnabled = ref(true)

  let notificationId = 0
  const notifications = ref<NotificationItem[]>([])

  const hasNotification = computed(() => notifications.value.length > 0)

  function setLoading(loading: boolean): void {
    isLoading.value = loading
  }

  function setError(err: string | null): void {
    error.value = err
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setTheme(newTheme: 'dark' | 'light'): void {
    applyTheme(newTheme)
    void frontendConfigApi.update({ theme: newTheme }).catch((error) => {
      console.error('Failed to persist frontend theme', error)
    })
  }

  function applyTheme(newTheme: 'dark' | 'light'): void {
    theme.value = newTheme
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  function setAllowToolPathsOutsideWorkspace(enabled: boolean): void {
    applyAllowToolPathsOutsideWorkspace(enabled)
    void frontendConfigApi.update({ allowToolPathsOutsideWorkspace: enabled }).catch((error) => {
      console.error('Failed to persist tool path restriction preference', error)
    })
  }

  function applyAllowToolPathsOutsideWorkspace(enabled: boolean): void {
    allowToolPathsOutsideWorkspace.value = enabled
  }

  function setMaxToolLoopIterations(value: number): void {
    const normalizedValue = Math.max(1, Math.min(32, Math.round(value)))
    applyMaxToolLoopIterations(normalizedValue)
    void frontendConfigApi.update({ maxToolLoopIterations: normalizedValue }).catch((error) => {
      console.error('Failed to persist max tool loop iterations preference', error)
    })
  }

  function applyMaxToolLoopIterations(value: number): void {
    maxToolLoopIterations.value = Math.max(1, Math.min(32, Math.round(value)))
  }

  function setToolLoopLimitEnabled(enabled: boolean): void {
    toolLoopLimitEnabled.value = enabled
    void frontendConfigApi.update({ toolLoopLimitEnabled: enabled }).catch((error) => {
      console.error('Failed to persist tool loop limit enabled preference', error)
    })
  }

  function initializeTheme(): void {
    applyTheme(DEFAULT_THEME)
  }

  async function loadFrontendConfigFromBackend(): Promise<void> {
    try {
      const config = await frontendConfigApi.get()
      if (config.theme) {
        applyTheme(config.theme)
      }
      applyAllowToolPathsOutsideWorkspace(config.allowToolPathsOutsideWorkspace === true)
      applyMaxToolLoopIterations(config.maxToolLoopIterations ?? DEFAULT_MAX_TOOL_LOOP_ITERATIONS)
      toolLoopLimitEnabled.value = config.toolLoopLimitEnabled !== false
    } catch (error) {
      console.error('Failed to load frontend config from backend', error)
    }
  }

  async function loadThemeFromBackend(): Promise<void> {
    await loadFrontendConfigFromBackend()
  }

  function toggleTheme(): void {
    const nextTheme = theme.value === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
  }

  function showNotification(
    message: string,
    type: NotificationType = 'info',
    options?: {
      title?: string
      duration?: number
      showProgress?: boolean
    }
  ): number {
    const notification: NotificationItem = {
      id: ++notificationId,
      message,
      type,
      title: options?.title,
      duration: options?.duration ?? 3000,
      showProgress: options?.showProgress ?? true
    }
    notifications.value.unshift(notification)
    return notification.id
  }

  function removeNotification(id: number): void {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  function notify(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    showNotification(message, type)
  }

  return {
    isLoading,
    error,
    sidebarCollapsed,
    theme,
    allowToolPathsOutsideWorkspace,
    maxToolLoopIterations,
    toolLoopLimitEnabled,
    notifications,
    hasNotification,
    setLoading,
    setError,
    toggleSidebar,
    setTheme,
    applyTheme,
    setAllowToolPathsOutsideWorkspace,
    applyAllowToolPathsOutsideWorkspace,
    setMaxToolLoopIterations,
    applyMaxToolLoopIterations,
    setToolLoopLimitEnabled,
    initializeTheme,
    loadFrontendConfigFromBackend,
    loadThemeFromBackend,
    toggleTheme,
    showNotification,
    removeNotification,
    notify
  }
})
