import { beforeEach, describe, expect, it, vi } from 'vitest'
import { frontendConfigApi } from '@/services/frontend-config'
import { useI18n } from './index'

vi.mock('@/services/frontend-config', () => ({
  frontendConfigApi: {
    get: vi.fn(),
    update: vi.fn().mockResolvedValue({})
  }
}))

describe('i18n preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists locale changes through the backend config service', () => {
    const { locale, setLocale } = useI18n()

    setLocale('en')

    expect(locale.value).toBe('en')
    expect(frontendConfigApi.update).toHaveBeenCalledWith({ locale: 'en' })
  })
})
