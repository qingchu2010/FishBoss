import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig, type Method } from 'axios'
import { API_BASE } from '@/config'

export interface ApiResponse<T = unknown> {
  data: T
  error?: string
}

export interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

const SESSION_AUTH_ERROR_CODES = new Set([
  'AUTH_SESSION_MISSING',
  'AUTH_SESSION_INVALID',
  'AUTH_SESSION_IDLE_EXPIRED',
  'AUTH_SESSION_ABSOLUTE_EXPIRED',
  'AUTH_USER_AGENT_MISMATCH',
  'AUTH_ACCOUNT_DISABLED'
])

let authUnauthorizedHandler: (() => void) | null = null

export function setAuthUnauthorizedHandler(handler: () => void): void {
  authUnauthorizedHandler = handler
}

export function triggerAuthUnauthorizedHandler(): void {
  authUnauthorizedHandler?.()
}

export function getApiErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const payload = data as ApiErrorPayload
  return payload.error?.code ?? null
}

export function getApiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const payload = data as ApiErrorPayload
  return payload.error?.message ?? null
}

export function isSessionAuthError(code: string | null | undefined): boolean {
  if (!code) {
    return false
  }
  return SESSION_AUTH_ERROR_CODES.has(code)
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      return config
    },
    (error: AxiosError) => {
      return Promise.reject(error)
    }
  )

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const errorCode = getApiErrorCode(error.response?.data)
      if (error.response?.status === 401 && authUnauthorizedHandler && isSessionAuthError(errorCode)) {
        authUnauthorizedHandler()
      }
      return Promise.reject(error)
    }
  )

  return client
}

export const apiClient = createApiClient()

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<T>(url, { params })
  return response.data
}

export async function post<T>(url: string, data?: unknown, method: Method = 'POST'): Promise<T> {
  const response = await apiClient.request<T>({
    url,
    method,
    data
  })
  return response.data
}

export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url)
  return response.data
}

export interface StreamMessage {
  content?: string
  thinking?: string
  toolCalls?: unknown[]
  error?: string
}

export function createStreamFetcher() {
  return function streamFetch(
    url: string,
    body: unknown,
    callbacks: {
      onMessage?: (data: StreamMessage) => void
      onDone?: () => void
      onError?: (error: string) => void
    },
    signal?: AbortSignal
  ): { stop: () => void } {
    let stopped = false
    const stop = () => {
      stopped = true
    }

    signal?.addEventListener('abort', stop, { once: true })

    fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      credentials: 'include',
      signal
    }).then(async (response) => {
      if (stopped) return

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`
        let errorCode: string | null = null
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errorBody = await response.json() as ApiErrorPayload
            errorCode = getApiErrorCode(errorBody)
            errorMessage = getApiErrorMessage(errorBody) ?? errorMessage
          } else {
            const errorText = (await response.text()).trim()
            if (errorText) errorMessage = errorText
          }
        } catch {
          console.error('Failed to parse stream error response')
        }
        if (response.status === 401 && isSessionAuthError(errorCode)) {
          triggerAuthUnauthorizedHandler()
        }
        callbacks.onError?.(errorMessage)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (!stopped) callbacks.onDone?.()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (stopped) return
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              if (!stopped) callbacks.onDone?.()
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.error) {
                const errorCode = getApiErrorCode(parsed)
                const errorMessage = getApiErrorMessage(parsed) ?? 'Request failed'
                if (isSessionAuthError(errorCode)) {
                  triggerAuthUnauthorizedHandler()
                }
                if (!stopped) callbacks.onError?.(errorMessage)
              } else {
                if (!stopped) callbacks.onMessage?.(parsed)
              }
            } catch {
              console.error('Failed to parse stream event payload')
            }
          }
        }
      }
    }).catch((err) => {
      if (!stopped && err.name !== 'AbortError') {
        callbacks.onError?.(err.message)
      }
    }).finally(() => {
      signal?.removeEventListener('abort', stop)
    })

    return { stop }
  }
}
