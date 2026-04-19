import express from 'express'
import rateLimit from 'express-rate-limit'
import { readConfigFile } from '../storage/index.js'

export interface RateLimitConfig {
  windowMs: number
  max: number
  chatMax: number
  enabled: boolean
}

function shouldSkipInternalRateLimit(req: express.Request): boolean {
  const fullPath = `${req.baseUrl || ''}${req.path}`

  return fullPath === '/api/health'
    || fullPath === '/api/chat/build-system-prompt'
    || fullPath === '/api/tools/ask/pending'
    || fullPath === '/api/tools/todos/status'
    || fullPath === '/api/tools/running'
}

export function createRateLimiters(config: RateLimitConfig) {
  if (!config.enabled) {
    return {
      globalLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
      chatLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
    }
  }

  return {
    globalLimiter: rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      skip: shouldSkipInternalRateLimit,
      message: { error: 'Too many requests, please try again later.' }
    }),
    chatLimiter: rateLimit({
      windowMs: config.windowMs,
      max: config.chatMax,
      skip: (req) => shouldSkipInternalRateLimit(req),
      message: { error: 'Too many chat requests, please try again later.' }
    })
  }
}

export function loadRateLimitConfig(): RateLimitConfig {
  const defaultConfig: RateLimitConfig = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    chatMax: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30', 10),
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false'
  }

  const savedConfig = readConfigFile('rate-limit.json')
  return savedConfig || defaultConfig
}

export function reloadRateLimiters(currentConfig: RateLimitConfig): RateLimitConfig | null {
  const newConfig = readConfigFile('rate-limit.json') as RateLimitConfig | null
  if (newConfig) {
    Object.assign(currentConfig, newConfig)
    return currentConfig
  }
  return null
}
