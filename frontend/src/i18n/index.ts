import { ref, computed } from 'vue'
import { zh_CN, type I18nKeys } from './zh'
import { en } from './en'
import { frontendConfigApi } from '@/services/frontend-config'

type I18nLocale = 'zh_CN' | 'en'
type I18nMessage = string | { [key: string]: I18nMessage }
type I18nDictionary = { [key: string]: I18nMessage }
const availableLocales: I18nLocale[] = ['zh_CN', 'en']

const locale = ref<I18nLocale>('zh_CN')

const messages: Record<I18nLocale, I18nDictionary> = {
  zh_CN: zh_CN as I18nDictionary,
  en: en as I18nDictionary
}

function resolveMessage(root: I18nDictionary, keys: string[]): I18nMessage | undefined {
  let current: I18nMessage = root
  for (const key of keys) {
    if (typeof current === 'object' && current !== null && key in current) {
      current = current[key]
    } else {
      return undefined
    }
  }
  return current
}

export function useI18n() {
  const t = (path: string, params?: Record<string, string>): string => {
    const keys = path.split('.')
    let result = resolveMessage(messages[locale.value], keys)
    if (typeof result !== 'string' && locale.value === 'zh_CN') {
      result = resolveMessage(messages.en, keys)
    }
    if (typeof result !== 'string') return path
    if (params) {
      return result.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`)
    }
    return result
  }

  const setLocale = (newLocale: I18nLocale) => {
    applyLocale(newLocale)
    void frontendConfigApi.update({ locale: newLocale }).catch((error) => {
      console.error('Failed to persist frontend locale', error)
    })
  }

  const applyLocale = (newLocale: I18nLocale) => {
    locale.value = newLocale
  }

  const currentLocale = computed(() => locale.value)

  const initLocale = () => {
    locale.value = 'zh_CN'
  }

  const loadLocaleFromBackend = async () => {
    try {
      const config = await frontendConfigApi.get()
      if (config.locale) {
        applyLocale(config.locale)
      }
    } catch (error) {
      console.error('Failed to load locale from backend', error)
    }
  }

  return {
    t,
    locale: currentLocale,
    availableLocales,
    setLocale,
    applyLocale,
    initLocale,
    loadLocaleFromBackend
  }
}

export type { I18nKeys }
