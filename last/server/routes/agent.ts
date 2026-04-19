import { Router } from 'express'
import { StreamEmitter } from '../services/agent/stream-emitter.js'
import { SessionManager } from '../services/agent/session-manager.js'
import { runConversationLoop } from '../services/agent/conversation-loop.js'
import type { ContextManager } from '../services/agent/conversation-loop.js'
import { toolRegistry } from '../tools/registry.js'
import { findProvider } from './chat.js'
import { readConfigFile } from '../storage/index.js'
import type { Tool, ChatMessage } from '../types/chat.js'
import { resolveAsk } from '../tools/tools/ask.js'

export const agentRouter = Router()

interface AgentStreamRequest {
  sessionId?: string
  agentId: string
  message: string
  modelId?: string
  providerId?: string
  tools?: Tool[]
  enableTools?: boolean
  conversationHistory?: ChatMessage[]
}

const sessionManager = SessionManager.getInstance()

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

function createNoOpContextManager(): ContextManager {
  return {
    checkLimit: () => ({ used: 0, limit: 128000, isOverLimit: false }),
    compress: async () => {}
  }
}

agentRouter.post('/stream', async (req, res) => {
  const { sessionId: existingSessionId, agentId, message, modelId, providerId, tools, enableTools, conversationHistory } = req.body as AgentStreamRequest

  if (!agentId || !message) {
    res.status(400).json({ error: 'agentId and message are required' })
    return
  }

  const sessionId = existingSessionId || generateSessionId()
  const isNewSession = !existingSessionId

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Session-Id', sessionId)

  const emitter = new StreamEmitter(res, sessionId)

  let session = sessionManager.getSession(sessionId)
  if (!session) {
    session = sessionManager.createSession(sessionId, {
      agentId,
      modelId: modelId || 'default',
      providerId: providerId || 'default'
    })
  }

  emitter.emit({ type: 'session', sessionId, created: isNewSession })

  try {
    const provider = await findProvider(providerId, modelId)
    if (!provider) {
      emitter.error('Provider not found or API Key not configured', 'PROVIDER_NOT_FOUND')
      await emitter.done('')
      return
    }

    const toolsToUse = enableTools !== false ? (tools || toolRegistry.getOpenAITools()) : []
    const contextManager = createNoOpContextManager()

    console.log(`[AgentStream] Starting conversation loop for session ${sessionId}`)
    console.log(`[AgentStream] Provider: ${provider.id}, Model: ${modelId}`)
    console.log(`[AgentStream] Tools enabled: ${toolsToUse.length > 0}`)

    session.status = 'streaming'
    session.updatedAt = Date.now()

    await runConversationLoop({
      sessionId,
      agentId,
      modelId: modelId || provider.selectedModels?.[0] || 'default',
      providerId: providerId || provider.id,
      messages: conversationHistory || [],
      newMessage: message,
      tools: toolsToUse,
      enableTools: enableTools !== false && toolsToUse.length > 0,
      streamEmitter: emitter,
      contextManager,
      abortSignal: session.abortController.signal
    })

    sessionManager.deleteSession(sessionId)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[AgentStream] Error for session ${sessionId}:`, message)
    emitter.error(message, 'INTERNAL_ERROR')
    await emitter.done('')
  }
})

agentRouter.delete('/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  sessionManager.abortSession(sessionId)
  console.log(`[AgentStream] Stream cancelled for session ${sessionId}`)

  res.json({ success: true })
})

agentRouter.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  res.json({
    sessionId: session.sessionId,
    agentId: session.agentId,
    modelId: session.modelId,
    providerId: session.providerId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  })
})

agentRouter.post('/session/:sessionId/respond', (req, res) => {
  const { sessionId } = req.params
  const { askId, answer } = req.body

  if (!askId || answer === undefined) {
    res.status(400).json({ error: 'askId and answer are required' })
    return
  }

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  console.log(`[AgentStream] Resuming session ${sessionId} with answer for ask ${askId}`)

  resolveAsk(askId, answer)

  session.status = 'streaming'
  session.updatedAt = Date.now()

  res.json({ success: true, sessionId, askId })
})
