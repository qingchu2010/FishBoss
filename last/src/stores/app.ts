import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'

const DEFAULT_THEME: 'dark' | 'light' = 'dark'

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
  const sidebarCollapsed = ref(false)
  const theme = ref<'dark' | 'light'>(DEFAULT_THEME)
  const loading = ref(false)

  let notificationId = 0
  const notifications = ref<NotificationItem[]>([])

  const hasNotification = computed(() => notifications.value.length > 0)

  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  async function loadAppConfig() {
    try {
      const data = await api.getAppConfig()
      theme.value = data.theme || DEFAULT_THEME
    } catch (error) {
      console.error('Failed to load app config:', error)
    }
  }

  async function saveAppConfig() {
    try {
      await api.saveAppConfig({
        theme: theme.value
      })
    } catch (error) {
      console.error('Failed to save app config:', error)
    }
  }

  const setTheme = async (newTheme: 'dark' | 'light') => {
    theme.value = newTheme
    await saveAppConfig()
  }

  const initializeTheme = () => {
    const prefersLight = window.matchMedia?.('prefers-color-scheme: light').matches
    theme.value = prefersLight ? 'light' : DEFAULT_THEME
  }

  const toggleTheme = () => {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  const setLoading = (value: boolean) => {
    loading.value = value
  }

  function showNotification(
    message: string,
    type: NotificationType = 'info',
    options?: {
      title?: string
      duration?: number
      showProgress?: boolean
    }
  ) {
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

  function removeNotification(id: number) {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    showNotification(message, type)
  }

  return {
    sidebarCollapsed,
    theme,
    loading,
    hasNotification,
    notifications,
    toggleSidebar,
    setTheme,
    loadAppConfig,
    initializeTheme,
    toggleTheme,
    setLoading,
    notify,
    showNotification,
    removeNotification
  }
})
