import { defineStore } from 'pinia'
import { ref } from 'vue'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: number
  data?: any
}

export const useLogStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([])

  function addLog(level: LogLevel, message: string, data?: any) {
    logs.value.push({
      id: Math.random().toString(36).substring(2),
      level,
      message,
      timestamp: Date.now(),
      data
    })
  }

  function info(message: string, data?: any) {
    addLog('info', message, data)
  }

  function warn(message: string, data?: any) {
    addLog('warn', message, data)
  }

  function error(message: string, data?: any) {
    addLog('error', message, data)
  }

  function debug(message: string, data?: any) {
    addLog('debug', message, data)
  }

  function clearLogs() {
    logs.value = []
  }

  function getLogsByLevel(level: LogLevel) {
    return logs.value.filter(log => log.level === level)
  }

  return {
    logs,
    addLog,
    info,
    warn,
    error,
    debug,
    clearLogs,
    getLogsByLevel
  }
})
