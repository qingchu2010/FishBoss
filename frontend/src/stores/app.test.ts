import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './app'
import { frontendConfigApi } from '@/services/frontend-config'

vi.mock('@/services/frontend-config', () => ({
  frontendConfigApi: {
    get: vi.fn(),
    update: vi.fn().mockResolvedValue({})
  }
}))

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.documentElement.removeAttribute('data-theme')
  })

  it('persists theme changes through the backend config service', () => {
    const store = useAppStore()

    store.setTheme('light')

    expect(store.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(frontendConfigApi.update).toHaveBeenCalledWith({ theme: 'light' })
  })

  it('persists max tool loop iterations through the backend config service', () => {
    const store = useAppStore()

    store.setMaxToolLoopIterations(16)

    expect(store.maxToolLoopIterations).toBe(16)
    expect(frontendConfigApi.update).toHaveBeenCalledWith({ maxToolLoopIterations: 16 })
  })

  it('clamps max tool loop iterations to valid range', () => {
    const store = useAppStore()

    store.setMaxToolLoopIterations(0)
    expect(store.maxToolLoopIterations).toBe(1)

    store.setMaxToolLoopIterations(50)
    expect(store.maxToolLoopIterations).toBe(32)
  })

  it('persists toolLoopLimitEnabled through the backend config service', () => {
    const store = useAppStore()

    store.setToolLoopLimitEnabled(false)

    expect(store.toolLoopLimitEnabled).toBe(false)
    expect(frontendConfigApi.update).toHaveBeenCalledWith({ toolLoopLimitEnabled: false })
  })
})
