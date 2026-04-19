import { ref, computed } from 'vue'
import { zh_CN, type I18nKeys } from './zh_cn'
import { en, type I18nKeys as EnI18nKeys } from './en'

type I18nLocale = 'zh_CN' | 'en'

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
    locale.value = newLocale
    localStorage.setItem('fishboss-locale', newLocale)
  }

  const currentLocale = computed(() => locale.value)

  const initLocale = () => {
    const saved = localStorage.getItem('fishboss-locale') as I18nLocale | null
    if (saved && (saved === 'zh_CN' || saved === 'en')) {
      locale.value = saved
    } else {
      const browserLang = navigator.language.toLowerCase()
      if (browserLang.startsWith('zh')) {
        locale.value = 'zh_CN'
      } else {
        locale.value = 'en'
      }
    }
  }

  return {
    t,
    locale: currentLocale,
    setLocale,
    initLocale
  }
}

export type { I18nKeys }
