import { Router } from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ListPromptsResultSchema,
  ReadResourceResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { finalizeToolResult } from '../tools/output.js'
import { spawn, ChildProcess } from 'child_process'
import { readConfigFile, writeConfigFile, getOAuthEntry, setOAuthEntry, deleteOAuthEntry, getAllOAuthEntries } from '../storage/index.js'
import path from 'path'
import fs from 'fs'
import http from 'http'

export const mcpRouter = Router()

interface McpLocalConfig {
  type: 'local'
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
}

interface McpRemoteConfig {
  type: 'remote'
  url: string
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  enabled?: boolean
  timeout?: number
}

type McpConfig = McpLocalConfig | McpRemoteConfig

interface MCPServerConfig {
  id: string
  name: string
  config: McpConfig
}

interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  serverId: string
  serverName: string
}

interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
  serverName: string
}

interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
  serverId: string
  serverName: string
}

interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scope?: string
}

interface OAuthClientInfo {
  clientId: string
  clientSecret?: string
  clientIdIssuedAt?: number
  clientSecretExpiresAt?: number
}

interface OAuthEntry {
  tokens?: OAuthTokens
  clientInfo?: OAuthClientInfo
  codeVerifier?: string
  oauthState?: string
  serverUrl?: string
}

interface ServerState {
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport
  process?: ChildProcess
  capabilities: Record<string, unknown>
}

const OAUTH_CALLBACK_PORT = 19876
const OAUTH_CALLBACK_PATH = '/mcp/oauth/callback'

export const serverStates: Map<string, ServerState> = new Map()
export const serverTools: Map<string, MCPTool[]> = new Map()
export const serverResources: Map<string, MCPResource[]> = new Map()
export const serverPrompts: Map<string, MCPPrompt[]> = new Map()
const pendingOAuthTransports: Map<string, StreamableHTTPClientTransport | SSEClientTransport> = new Map()
let oauthCallbackServer: http.Server | null = null
const pendingAuthCallbacks: Map<string, { resolve: (code: string) => void; reject: (err: Error) => void }> = new Map()

function getConfigDir(): string {
  const configDir = path.join(process.env.APPDATA || process.env.HOME || '.', 'fishboss')
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  return configDir
}

function getServers(): MCPServerConfig[] {
  const data = readConfigFile('mcp_servers.json')
  if (data?.servers) {
    return data.servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      config: s.config || { type: 'local', command: s.command ? [s.command, ...(s.args || [])] : [] }
    }))
  }
  return []
}

function saveServers(servers: MCPServerConfig[]) {
  writeConfigFile('mcp_servers.json', { servers })
}

async function loadOAuthData(): Promise<Record<string, OAuthEntry>> {
  return await getAllOAuthEntries()
}

async function saveOAuthData(data: Record<string, OAuthEntry>): Promise<void> {
  for (const [serverId, entry] of Object.entries(data)) {
    await setOAuthEntry(serverId, entry)
  }
}

async function getOAuthCache(serverId: string): Promise<OAuthEntry | null> {
  return await getOAuthEntry(serverId)
}

async function setOAuthCache(serverId: string, entry: OAuthEntry): Promise<void> {
  await setOAuthEntry(serverId, entry)
}

async function deleteOAuthCache(serverId: string): Promise<void> {
  await deleteOAuthEntry(serverId)
}

class OAuthProvider {
  constructor(
    private serverId: string,
    private serverUrl: string,
    private config: McpOAuthConfig
  ) {}

  get redirectUrl(): string {
    return `http://127.0.0.1:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`
  }

  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'FishBoss',
      client_uri: 'https://fishboss.ai',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_post' : 'none',
    }
  }

  async clientInformation() {
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }
    }

    const entry = await getOAuthEntry(this.serverId)
    if (entry?.clientInfo && entry.serverUrl === this.serverUrl) {
      if (entry.clientInfo.clientSecretExpiresAt && entry.clientInfo.clientSecretExpiresAt < Date.now() / 1000) {
        return undefined
      }
      return {
        client_id: entry.clientInfo.clientId,
        client_secret: entry.clientInfo.clientSecret,
      }
    }
    return undefined
  }

  async saveClientInformation(info: { client_id: string; client_secret?: string; client_id_issued_at?: number; client_secret_expires_at?: number }) {
    const entry = (await getOAuthEntry(this.serverId)) || {}
    entry.clientInfo = {
      clientId: info.client_id,
      clientSecret: info.client_secret,
      clientIdIssuedAt: info.client_id_issued_at,
      clientSecretExpiresAt: info.client_secret_expires_at,
    }
    entry.serverUrl = this.serverUrl
    await setOAuthEntry(this.serverId, entry)
  }

  async tokens() {
    const entry = await getOAuthEntry(this.serverId)
    if (!entry?.tokens || entry.serverUrl !== this.serverUrl) return undefined

    return {
      access_token: entry.tokens.accessToken,
      token_type: 'Bearer',
      refresh_token: entry.tokens.refreshToken,
      expires_in: entry.tokens.expiresAt
        ? Math.max(0, Math.floor(entry.tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: entry.tokens.scope,
    }
  }

  async saveTokens(tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }) {
    const entry = (await getOAuthEntry(this.serverId)) || {}
    entry.tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
      scope: tokens.scope,
    }
    entry.serverUrl = this.serverUrl
    await setOAuthEntry(this.serverId, entry)
  }

  async redirectToAuthorization(url: URL) {
    console.log(`OAuth redirect: ${url.toString()}`)
  }

  async saveCodeVerifier(verifier: string) {
    const entry = (await getOAuthEntry(this.serverId)) || {}
    entry.codeVerifier = verifier
    await setOAuthEntry(this.serverId, entry)
  }

  async codeVerifier() {
    const entry = await getOAuthEntry(this.serverId)
    if (!entry?.codeVerifier) {
      throw new Error(`No code verifier for server: ${this.serverId}`)
    }
    return entry.codeVerifier
  }

  async saveState(state: string) {
    const entry = (await getOAuthEntry(this.serverId)) || {}
    entry.oauthState = state
    await setOAuthEntry(this.serverId, entry)
  }

  async state() {
    const entry = await getOAuthEntry(this.serverId)
    if (entry?.oauthState) return entry.oauthState

    const newState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const entryToUpdate = (await getOAuthEntry(this.serverId)) || {}
    entryToUpdate.oauthState = newState
    await setOAuthEntry(this.serverId, entryToUpdate)
    return newState
  }
}

async function ensureOAuthCallbackServer(): Promise<void> {
  if (oauthCallbackServer) return

  const isPortInUse = await new Promise<boolean>(resolve => {
    const socket = require('net').createConnection(OAUTH_CALLBACK_PORT, '127.0.0.1')
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
  })

  if (isPortInUse) {
    console.log('OAuth callback server already running')
    return
  }

  oauthCallbackServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`)

    if (url.pathname !== OAUTH_CALLBACK_PATH) {
      res.writeHead(404).end('Not found')
      return
    }

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDesc = url.searchParams.get('error_description')

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(`<html><body><h1>Authorization Failed</h1><p>${errorDesc || error}</p></body></html>`)
      return
    }

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>Error</h1><p>Missing code or state</p></body></html>')
      return
    }

    const pending = pendingAuthCallbacks.get(state)
    if (pending) {
      pendingAuthCallbacks.delete(state)
      pending.resolve(code)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>')
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>Error</h1><p>Invalid or expired state</p></body></html>')
    }
  })

  await new Promise<void>(resolve => {
    oauthCallbackServer!.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', () => resolve())
  })
  console.log(`OAuth callback server started on port ${OAUTH_CALLBACK_PORT}`)
}

async function connectLocalServer(server: MCPServerConfig): Promise<ServerState> {
  const config = server.config as McpLocalConfig
  const [cmd, ...args] = config.command
  const cwd = process.cwd()

  const transport = new StdioClientTransport({
    command: cmd,
    args,
    env: { ...process.env, ...config.environment },
    stderr: 'pipe',
  })

  const client = new Client({ name: 'fishboss', version: '1.0.0' }, {
    capabilities: {
      tools: {},
      resources: { subscribe: true, listChanged: true },
      prompts: {},
    },
  })

  await client.connect(transport)

  const proc = (transport as any).process as ChildProcess | undefined
  proc?.stderr?.on('data', (chunk: Buffer) => {
    console.error(`MCP ${server.name} stderr:`, chunk.toString())
  })

  return { client, transport, process: proc, capabilities: {} }
}

async function connectRemoteServer(server: MCPServerConfig): Promise<ServerState> {
  const config = server.config as McpRemoteConfig
  const url = new URL(config.url)
  const oauthConfig = typeof config.oauth === 'object' ? config.oauth : undefined
  const oauthDisabled = config.oauth === false

  let authProvider: OAuthProvider | undefined
  if (!oauthDisabled) {
    authProvider = new OAuthProvider(server.id, config.url, oauthConfig || {})
  }

  const timeout = config.timeout || 30000

  const transports = [
    { name: 'StreamableHTTP', transport: new StreamableHTTPClientTransport(url, { authProvider, requestInit: config.headers ? { headers: config.headers } : undefined }) },
    { name: 'SSE', transport: new SSEClientTransport(url, { authProvider, requestInit: config.headers ? { headers: config.headers } : undefined }) },
  ]

  let lastError: Error | undefined

  for (const { name, transport } of transports) {
    try {
      const client = new Client({ name: 'fishboss', version: '1.0.0' }, {
        capabilities: {
          tools: {},
          resources: { subscribe: true, listChanged: true },
          prompts: {},
        },
      })

      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeout)),
      ])

      console.log(`Connected to ${server.name} via ${name}`)
      return { client, transport, capabilities: {} }
    } catch (err: any) {
      lastError = err
      console.error(`Failed to connect via ${name}:`, err.message)

      if (err.message?.includes('OAuth') || err.message?.includes('Unauthorized') || err.message?.includes('401')) {
        pendingOAuthTransports.set(server.id, transport as StreamableHTTPClientTransport | SSEClientTransport)
        throw new Error('NEEDS_AUTH')
      }
    }
  }

  throw lastError || new Error('Failed to connect')
}

async function initializeServer(server: MCPServerConfig): Promise<{
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
  capabilities: Record<string, unknown>
  needsAuth?: boolean
}> {
  const existingState = serverStates.get(server.id)
  if (existingState) {
    return {
      tools: serverTools.get(server.id) || [],
      resources: serverResources.get(server.id) || [],
      prompts: serverPrompts.get(server.id) || [],
      capabilities: existingState.capabilities,
    }
  }

  try {
    const state: ServerState = server.config.type === 'local'
      ? await connectLocalServer(server)
      : await connectRemoteServer(server)

    serverStates.set(server.id, state)

    const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
      state.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema).catch(() => ({ tools: [] })),
      state.client.request({ method: 'resources/list', params: {} }, ListResourcesResultSchema).catch(() => ({ resources: [] })),
      state.client.request({ method: 'prompts/list', params: {} }, ListPromptsResultSchema).catch(() => ({ prompts: [] })),
    ])

    const tools: MCPTool[] = (toolsResult.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema as MCPTool['inputSchema'],
      serverId: server.id,
      serverName: server.name,
    }))

    const resources: MCPResource[] = (resourcesResult.resources || []).map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
      serverId: server.id,
      serverName: server.name,
    }))

    const prompts: MCPPrompt[] = (promptsResult.prompts || []).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
      serverId: server.id,
      serverName: server.name,
    }))

    serverTools.set(server.id, tools)
    serverResources.set(server.id, resources)
    serverPrompts.set(server.id, prompts)

    return { tools, resources, prompts, capabilities: state.capabilities }
  } catch (err: any) {
    if (err.message === 'NEEDS_AUTH') {
      return { tools: [], resources: [], prompts: [], capabilities: {}, needsAuth: true }
    }
    throw err
  }
}

mcpRouter.get('/servers', (req, res) => {
  const servers = getServers()
  const serversWithStatus = servers.map(s => ({
    ...s,
    connected: serverStates.has(s.id),
    tools: serverTools.get(s.id) || [],
    resources: serverResources.get(s.id) || [],
    prompts: serverPrompts.get(s.id) || []
  }))
  res.json({ servers: serversWithStatus })
})

mcpRouter.put('/servers', (req, res) => {
  const { servers } = req.body
  saveServers(servers)
  res.json({ success: true })
})

mcpRouter.post('/servers', (req, res) => {
  const { id, name, config } = req.body
  const servers = getServers()
  
  if (servers.find(s => s.id === id)) {
    return res.status(400).json({ error: 'Server ID already exists' })
  }
  
  servers.push({ id, name, config })
  saveServers(servers)
  res.json({ success: true, server: { id, name, config } })
})

mcpRouter.post('/servers/:id/initialize', async (req, res) => {
  const { id } = req.params
  const servers = getServers()
  const server = servers.find(s => s.id === id)

  if (!server) {
    return res.status(404).json({ error: 'Server not found' })
  }

  if (server.config.enabled === false) {
    return res.json({ success: false, disabled: true })
  }

  try {
    const result = await initializeServer(server)
    res.json({
      success: true,
      needsAuth: result.needsAuth,
      tools: result.tools,
      resources: result.resources,
      prompts: result.prompts,
      capabilities: result.capabilities,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initialize server'
    res.status(500).json({ error: message })
  }
})

mcpRouter.post('/servers/:id/tools/call', async (req, res) => {
  const { id } = req.params
  const { name, arguments: args } = req.body

  const state = serverStates.get(id)
  if (!state) {
    return res.status(400).json({ error: 'Server not connected' })
  }

  try {
    const result = await state.client.request(
      { method: 'tools/call', params: { name, arguments: args || {} } },
      CallToolResultSchema,
    )
    const output = result.content?.map(item => {
      if (item.type === 'text') {
        return item.text || ''
      }
      if (item.type === 'resource') {
        return JSON.stringify(item.resource)
      }
      return ''
    }).filter(Boolean).join('\n') || ''
    const finalized = finalizeToolResult(name, {
      title: name,
      output
    })
    res.json({
      ...result,
      preview: finalized.output,
      metadata: finalized.metadata
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Tool call failed'
    res.status(500).json({ error: message })
  }
})

mcpRouter.post('/servers/:id/resources/read', async (req, res) => {
  const { id } = req.params
  const { uri } = req.body

  const state = serverStates.get(id)
  if (!state) {
    return res.status(400).json({ error: 'Server not connected' })
  }

  try {
    const result = await state.client.request(
      { method: 'resources/read', params: { uri } },
      ReadResourceResultSchema,
    )
    res.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Resource read failed'
    res.status(500).json({ error: message })
  }
})

mcpRouter.post('/servers/:id/prompts/get', async (req, res) => {
  const { id } = req.params
  const { name, arguments: args } = req.body

  const state = serverStates.get(id)
  if (!state) {
    return res.status(400).json({ error: 'Server not connected' })
  }

  try {
    const result = await state.client.request(
      { method: 'prompts/get', params: { name, arguments: args || {} } },
      GetPromptResultSchema,
    )
    res.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Prompt get failed'
    res.status(500).json({ error: message })
  }
})

mcpRouter.get('/servers/:id/tools', (req, res) => {
  const { id } = req.params
  res.json({ tools: serverTools.get(id) || [] })
})

mcpRouter.get('/servers/:id/resources', (req, res) => {
  const { id } = req.params
  res.json({ resources: serverResources.get(id) || [] })
})

mcpRouter.get('/servers/:id/prompts', (req, res) => {
  const { id } = req.params
  res.json({ prompts: serverPrompts.get(id) || [] })
})

mcpRouter.delete('/servers/:id', async (req, res) => {
  const { id } = req.params
  const state = serverStates.get(id)

  if (state) {
    try {
      await state.client.close()
    } catch {}
  }

  serverStates.delete(id)
  serverTools.delete(id)
  serverResources.delete(id)
  serverPrompts.delete(id)
  pendingOAuthTransports.delete(id)

  res.json({ success: true })
})

mcpRouter.get('/tools', (req, res) => {
  const allTools: MCPTool[] = []
  for (const tools of serverTools.values()) {
    allTools.push(...tools)
  }
  res.json({ tools: allTools })
})

mcpRouter.get('/resources', (req, res) => {
  const allResources: MCPResource[] = []
  for (const resources of serverResources.values()) {
    allResources.push(...resources)
  }
  res.json({ resources: allResources })
})

mcpRouter.get('/prompts', (req, res) => {
  const allPrompts: MCPPrompt[] = []
  for (const prompts of serverPrompts.values()) {
    allPrompts.push(...prompts)
  }
  res.json({ prompts: allPrompts })
})

mcpRouter.get('/servers/:id/auth/status', async (req, res) => {
  const { id } = req.params
  const entry = await getOAuthEntry(id)

  if (!entry?.tokens) {
    return res.json({ status: 'not_authenticated' })
  }

  const expired = entry.tokens.expiresAt && entry.tokens.expiresAt < Date.now() / 1000
  res.json({ status: expired ? 'expired' : 'authenticated' })
})

mcpRouter.post('/servers/:id/auth/start', async (req, res) => {
  const { id } = req.params
  const servers = getServers()
  const server = servers.find(s => s.id === id)

  if (!server || server.config.type !== 'remote') {
    return res.status(400).json({ error: 'Server not found or not a remote server' })
  }

  const config = server.config as McpRemoteConfig
  if (config.oauth === false) {
    return res.status(400).json({ error: 'OAuth is disabled for this server' })
  }

  try {
    await ensureOAuthCallbackServer()

    const oauthConfig = typeof config.oauth === 'object' ? config.oauth : {}
    const authProvider = new OAuthProvider(id, config.url, oauthConfig)
    const url = new URL(config.url)

    const transport = new StreamableHTTPClientTransport(url, { authProvider })
    pendingOAuthTransports.set(id, transport)

    const client = new Client({ name: 'fishboss', version: '1.0.0' })

    try {
      await client.connect(transport)
      res.json({ status: 'already_authenticated' })
    } catch (err: any) {
      if (err.message?.includes('OAuth') || err.message?.includes('Unauthorized')) {
        const state = await authProvider.state()
        const entry = getOAuthEntry(id) || {}
        res.json({
          status: 'needs_auth',
          oauthState: state,
          message: 'Please complete OAuth in browser',
        })
      } else {
        throw err
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start OAuth'
    res.status(500).json({ error: message })
  }
})

mcpRouter.post('/servers/:id/auth/callback', async (req, res) => {
  const { id } = req.params
  const { code, state } = req.body

  const transport = pendingOAuthTransports.get(id)
  if (!transport) {
    return res.status(400).json({ error: 'No pending OAuth flow' })
  }

  try {
    await (transport as any).finishAuth(code)
    pendingOAuthTransports.delete(id)

    const servers = getServers()
    const server = servers.find(s => s.id === id)
    if (server) {
      const result = await initializeServer(server)
      res.json({ success: true, tools: result.tools })
    } else {
      res.json({ success: true })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'OAuth callback failed'
    res.status(500).json({ error: message })
  }
})

mcpRouter.delete('/servers/:id/auth', (req, res) => {
  const { id } = req.params
  deleteOAuthEntry(id)
  pendingOAuthTransports.delete(id)
  res.json({ success: true })
})

process.on('SIGINT', async () => {
  for (const [id, state] of serverStates) {
    try {
      await state.client.close()
    } catch {}
  }
  process.exit(0)
})
