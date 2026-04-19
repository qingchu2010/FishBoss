import { get } from './http'

export interface LogEntry {
  timestamp: string
  level: string
  levelName: string
  message: string
  context?: Record<string, unknown>
  error?: string
}

export interface LogsResponse {
  entries: LogEntry[]
  total: number
  offset: number
  limit: number
}

export interface LogLevels {
  levels: string[]
}

export interface LogFilter {
  level?: string
  from?: string
  to?: string
  search?: string
  limit?: number
  offset?: number
}

export const logsApi = {
  async getLogs(filter?: LogFilter): Promise<LogsResponse> {
    return get<LogsResponse>('/logs/', filter as Record<string, unknown>)
  },

  async getLevels(): Promise<LogLevels> {
    return get<LogLevels>('/logs/levels')
  }
}