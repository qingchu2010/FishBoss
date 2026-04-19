import { Router } from 'express'
import { toolRegistry } from '../tools/registry.js'
import type { PermissionRequest } from '../tools/tool.js'
import { setPermissionConfig, getPermissionConfig, resolveWorkingDirectory } from '../tools/permission.js'
import { finalizeToolResult } from '../tools/output.js'
import { readConfigFile, writeConfigFile } from '../storage/index.js'
import { hasIncompleteTodos, getIncompleteTodos, getAllTodos, clearTodos } from '../tools/tools/todos.js'
import { getPendingAsk, resolveAsk, cancelAsk, cancelSessionAsks } from '../tools/tools/ask.js'
import { serverTools, serverStates } from './mcp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

export const toolsRouter = Router()

interface PendingPermission {
  id: string
  request: PermissionRequest
  resolve: (approved: boolean) => void
  timeout: NodeJS.Timeout
}

interface RunningTool {
  id: string
  toolId: string
  sessionId: string
  abortController: AbortController
  startTime: number
}

const pendingPermissions = new Map<string, PendingPermission>()
const runningTools = new Map<string, RunningTool>()

toolsRouter.get('/list', (req, res) => {
  const tools = toolRegistry.getOpenAITools()
  
  const mcpTools: typeof tools = []
  for (const [, toolsList] of serverTools) {
    for (const tool of toolsList) {
      mcpTools.push({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      })
    }
  }
  
  res.json({ tools: [...tools, ...mcpTools] })
})

toolsRouter.get('/definitions', (req, res) => {
  const tools = toolRegistry.list().map(tool => ({
    id: tool.id,
    description: tool.definition.description,
    parameters: tool.definition.parameters
  }))
  res.json({ tools })
})

toolsRouter.post('/execute', async (req, res) => {
  try {
    const { toolId, args, sessionId, workingDirectory } = req.body
    
    if (!toolId || !args) {
      return res.status(400).json({ error: 'toolId and args are required' })
    }
    
    let result: { title: string; output: string; metadata?: Record<string, unknown> }
    
    const isLocalTool = toolRegistry.ids().includes(toolId)
    
    if (isLocalTool) {
      const settings = readConfigFile('tools.json') || {}
      const workDir = resolveWorkingDirectory(workingDirectory || settings.workingDirectory)
      const autoApproveSettings = settings.autoApprove || {}
      const executionId = `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const abortController = new AbortController()
      
      runningTools.set(executionId, {
        id: executionId,
        toolId,
        sessionId: sessionId || 'default',
        abortController,
        startTime: Date.now()
      })
      
      const askPermission = async (request: PermissionRequest): Promise<boolean> => {
        if (autoApproveSettings[request.permission] === true) {
          return true
        }
        
        const permissionId = `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            pendingPermissions.delete(permissionId)
            resolve(false)
          }, 60000)
          
          pendingPermissions.set(permissionId, {
            id: permissionId,
            request,
            resolve,
            timeout
          })
        })
      }
      
      try {
        result = await toolRegistry.execute(toolId, args, {
          sessionId: sessionId || 'default',
          workingDirectory: workDir,
          askPermission,
          abort: abortController.signal
        })
      } finally {
        runningTools.delete(executionId)
      }
    } else {
      const serverState = Array.from(serverStates.entries()).find(([_, state]) => 
        serverTools.get(_)?.some(t => t.name === toolId)
      )
      
      if (!serverState) {
        return res.status(404).json({ error: `Tool not found: ${toolId}` })
      }
      
      const [serverId] = serverState
      const mcpResult = await serverStates.get(serverId)!.client.request(
        { method: 'tools/call', params: { name: toolId, arguments: args } },
        CallToolResultSchema
      )
      
      const isError = mcpResult.content?.some(c => c.type === 'text' && c.text?.includes('Error'))
      result = {
        title: toolId,
        output: mcpResult.content?.map(c => {
          if (c.type === 'text') return c.text
          if (c.type === 'resource') return JSON.stringify(c.resource)
          return ''
        }).filter(Boolean).join('\n') || '',
        metadata: { isError }
      }
    }
    
    const finalizedResult = finalizeToolResult(toolId, result)
    res.json({ success: true, ...finalizedResult })
  } catch (error: any) {
    console.error('Tool execution error:', error)
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      res.status(499).json({ error: 'Tool execution aborted by user' })
    } else {
      res.status(500).json({ error: error.message })
    }
  }
})

toolsRouter.post('/permission/request', (req, res) => {
  const { permissionId } = req.body
  
  const pending = pendingPermissions.get(permissionId)
  if (!pending) {
    return res.status(404).json({ error: 'Permission request not found or expired' })
  }
  
  res.json({
    id: pending.id,
    request: pending.request
  })
})

toolsRouter.post('/permission/respond', (req, res) => {
  const { permissionId, approved } = req.body
  
  const pending = pendingPermissions.get(permissionId)
  if (!pending) {
    return res.status(404).json({ error: 'Permission request not found or expired' })
  }
  
  clearTimeout(pending.timeout)
  pendingPermissions.delete(permissionId)
  pending.resolve(approved)
  
  res.json({ success: true })
})

toolsRouter.get('/permission/pending', (req, res) => {
  const pending = Array.from(pendingPermissions.values()).map(p => ({
    id: p.id,
    request: p.request
  }))
  res.json({ pending })
})

toolsRouter.get('/config', (req, res) => {
  const config = getPermissionConfig()
  res.json({ config })
})

toolsRouter.post('/config', (req, res) => {
  const config = req.body
  setPermissionConfig(config)
  res.json({ success: true })
})

toolsRouter.get('/settings', (req, res) => {
  const settings = readConfigFile('tools.json') || {
    autoApprove: {
      read: false,
      write: false,
      edit: false,
      bash: false,
      glob: false,
      grep: false,
      ls: false
    },
    allowedDirectories: [],
    workingDirectory: process.cwd()
  }
  res.json(settings)
})

toolsRouter.post('/settings', (req, res) => {
  const settings = req.body
  writeConfigFile('tools.json', settings)
  res.json({ success: true })
})

toolsRouter.get('/todos/status', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined
  res.json({
    hasIncomplete: hasIncompleteTodos(sessionId),
    todos: getAllTodos(sessionId),
    incompleteTodos: getIncompleteTodos(sessionId)
  })
})

toolsRouter.post('/todos/clear', (req, res) => {
  const { sessionId } = req.body
  clearTodos(sessionId)
  res.json({ success: true })
})

toolsRouter.get('/ask/pending', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined
  const pending = getPendingAsk(sessionId)
  if (pending) {
    res.json({
      id: pending.id,
      header: pending.header,
      questions: pending.questions
    })
  } else {
    res.json(null)
  }
})

toolsRouter.post('/ask/respond', (req, res) => {
  const { askId, answer } = req.body
  const resolved = resolveAsk(askId, answer)
  res.json({ success: resolved })
})

toolsRouter.post('/ask/cancel', (req, res) => {
  const { askId } = req.body
  const cancelled = cancelAsk(askId)
  res.json({ success: cancelled })
})

toolsRouter.post('/ask/cancel-session', (req, res) => {
  const { sessionId } = req.body
  const count = cancelSessionAsks(sessionId)
  res.json({ success: true, cancelledCount: count })
})

toolsRouter.post('/abort', (req, res) => {
  const { executionId, sessionId } = req.body
  
  if (executionId) {
    const running = runningTools.get(executionId)
    if (running) {
      running.abortController.abort()
      runningTools.delete(executionId)
      return res.json({ success: true, message: `Tool execution ${executionId} aborted` })
    }
    return res.status(404).json({ error: 'Execution not found' })
  }
  
  if (sessionId) {
    let abortedCount = 0
    for (const [id, tool] of runningTools) {
      if (tool.sessionId === sessionId) {
        tool.abortController.abort()
        runningTools.delete(id)
        abortedCount++
      }
    }
    return res.json({ success: true, abortedCount })
  }
  
  res.status(400).json({ error: 'executionId or sessionId is required' })
})

toolsRouter.get('/running', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined
  
  const tools = Array.from(runningTools.values())
    .filter(t => !sessionId || t.sessionId === sessionId)
    .map(t => ({
      id: t.id,
      toolId: t.toolId,
      sessionId: t.sessionId,
      startTime: t.startTime,
      duration: Date.now() - t.startTime
    }))
  
  res.json({ tools })
})
