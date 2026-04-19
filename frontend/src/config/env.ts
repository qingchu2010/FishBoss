export interface AppConfig {
  apiBase: string
  appName: string
  version: string
}

export function getAppConfig(): AppConfig {
  return {
    apiBase: import.meta.env.VITE_API_BASE || '/api',
    appName: import.meta.env.VITE_APP_NAME || 'FishBoss',
    version: import.meta.env.VITE_APP_VERSION || '0.1.0'
  }
}
