import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import rateLimit from 'express-rate-limit'
import { configRouter } from './routes/config.js'
import { providerRouter } from './routes/provider.js'
import { chatRouter } from './routes/chat.js'
import { dashboardRouter } from './routes/dashboard.js'
import { conversationsRouter } from './routes/conversations.js'
import { mcpRouter } from './routes/mcp.js'
import { skillRouter } from './routes/skill.js'
import { toolsRouter } from './routes/tools.js'
import { agentRouter } from './routes/agent.js'
import { readConfigFile } from './storage/index.js'

interface RateLimitConfig {
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

function createRateLimiters(config: RateLimitConfig) {
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

const defaultConfig: RateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  chatMax: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30', 10),
  enabled: process.env.RATE_LIMIT_ENABLED !== 'false'
}

const savedConfig = readConfigFile('rate-limit.json')
const rateLimitConfig: RateLimitConfig = savedConfig || defaultConfig

let { globalLimiter, chatLimiter } = createRateLimiters(rateLimitConfig)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 6577

app.use(cors({
  origin: /^http:\/\/localhost:\d+$/,
  credentials: true
}))
app.use(express.json({ limit: '200mb' }))
app.use(express.urlencoded({ limit: '200mb', extended: true }))

app.use(globalLimiter)

app.use('/api/config', configRouter)
app.use('/api/provider', providerRouter)
app.use('/api/chat', chatLimiter, chatRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/mcp', mcpRouter)
app.use('/api/skill', skillRouter)
app.use('/api/tools', toolsRouter)
app.use('/api/agent', agentRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/config/rate-limit/reload', (req, res) => {
  const newConfig = readConfigFile('rate-limit.json') as RateLimitConfig | null
  if (newConfig) {
    Object.assign(rateLimitConfig, newConfig)
    const newLimiters = createRateLimiters(rateLimitConfig)
    globalLimiter = newLimiters.globalLimiter
    chatLimiter = newLimiters.chatLimiter
    res.json({ success: true, config: rateLimitConfig })
  } else {
    res.json({ success: false, error: 'Config not found' })
  }
})

app.use((err: Error & { type?: string; status?: number; statusCode?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)

  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({ error: 'Request entity too large' })
  }

  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`FishBoss API server running on http://localhost:${PORT}`)
  console.log(`Config directory: ~/.fishboss`)
  console.log(`Rate limit: ${rateLimitConfig.enabled ? `${rateLimitConfig.max}/${rateLimitConfig.windowMs}ms (chat: ${rateLimitConfig.chatMax})` : 'disabled'}`)
})

process.stdin.resume()
