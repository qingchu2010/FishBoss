import { ref, computed } from 'vue'
import { zh_CN, type I18nKeys } from './zh'
import { en, type I18nKeys as EnI18nKeys } from './en'
import { frontendConfigApi } from '@/services/frontend-config'

type I18nLocale = 'zh_CN' | 'en'
const availableLocales: I18nLocale[] = ['zh_CN', 'en']

const locale = ref<I18nLocale>('zh_CN')

const messages: Record<I18nLocale, I18nKeys | EnI18nKeys> = {
  zh_CN,
  en
}

export function useI18n() {
  const t = (path: string, params?: Record<string, string>): string => {
    const keys = path.split('.')
    let result: any = messages[locale.value]
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key]
      } else {
        if (locale.value === 'zh_CN') {
          let fallback: any = messages.en
          for (const k of keys) {
            if (fallback && typeof fallback === 'object' && k in fallback) {
              fallback = fallback[k]
            } else {
              return path
            }
          }
          if (typeof fallback === 'string') {
            result = fallback
          } else {
            return path
          }
        } else {
          return path
        }
        break
      }
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
