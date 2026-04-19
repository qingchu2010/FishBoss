import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, createStreamFetcher, setAuthUnauthorizedHandler } from './http'

interface ResponseInterceptorHandler {
  fulfilled?: (value: unknown) => unknown
  rejected?: (error: AxiosError) => Promise<never>
}

interface ResponseInterceptorManager {
  handlers: ResponseInterceptorHandler[]
}

function getRejectedResponseInterceptor(): (error: AxiosError) => Promise<never> {
  const manager = apiClient.interceptors.response as unknown as ResponseInterceptorManager
  const rejectedHandler = manager.handlers.find((handler) => typeof handler.rejected === 'function')?.rejected
  if (!rejectedHandler) {
    throw new Error('Response interceptor not found')
  }
  return rejectedHandler
}

describe('http auth handling', () => {
  let unauthorizedCalls: number

  beforeEach(() => {
    unauthorizedCalls = 0
    setAuthUnauthorizedHandler(() => {
      unauthorizedCalls += 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not trigger unauthorized fallback for bootstrap token errors', async () => {
    const rejected = getRejectedResponseInterceptor()
    const error = new AxiosError('Unauthorized')
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: {
          code: 'AUTH_BOOTSTRAP_TOKEN_INVALID',
          message: 'Invalid bootstrap token'
        }
      }
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(unauthorizedCalls).toBe(0)
  })

  it('does not trigger unauthorized fallback for invalid credentials', async () => {
    const rejected = getRejectedResponseInterceptor()
    const error = new AxiosError('Unauthorized')
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      }
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(unauthorizedCalls).toBe(0)
  })

  it('triggers unauthorized fallback only for session-class stream errors', async () => {
    const streamFetch = createStreamFetcher()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: () => 'application/json'
      },
      json: async () => ({
        error: {
          code: 'AUTH_SESSION_IDLE_EXPIRED',
          message: 'Session idle expired'
        }
      })
    })

    const firstError = vi.fn()
    streamFetch('/test', {}, { onError: firstError })
    await Promise.resolve()
    await Promise.resolve()

    expect(firstError).toHaveBeenCalledWith('Session idle expired')
    expect(unauthorizedCalls).toBe(1)

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: () => 'application/json'
      },
      json: async () => ({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      })
    })

    const secondError = vi.fn()
    streamFetch('/test', {}, { onError: secondError })
    await Promise.resolve()
    await Promise.resolve()

    expect(secondError).toHaveBeenCalledWith('Invalid username or password')
    expect(unauthorizedCalls).toBe(1)
  })
})
