<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/i18n'
import {
  Plus, Trash2, Play, Globe, FileText, MessageSquare, Settings, X, Wrench,
  Server, Link2, Key, RefreshCw, CheckCircle, AlertCircle, Clock
} from 'lucide-vue-next'
import { useMCPStore, type MCPServer, type McpLocalConfig, type McpRemoteConfig, type ServerStatus } from '@/stores/mcp'
import { api } from '@/services/api'

const { t } = useI18n()
const mcpStore = useMCPStore()
const { isLoading } = storeToRefs(mcpStore)
const showAddModal = ref(false)
const showTemplatesModal = ref(false)
const showDetailModal = ref(false)
const showJsonModal = ref(false)
const showDeleteConfirm = ref(false)
const serverToDelete = ref<MCPServer | null>(null)
const editingServer = ref<MCPServer | null>(null)
const selectedServer = ref<MCPServer | null>(null)
const serverType = ref<'local' | 'remote'>('local')
const jsonInput = ref('')
const jsonError = ref('')

const newLocalServer = ref({
  name: '',
  command: '',
  args: '',
  env: [] as { key: string; value: string }[],
  timeout: 30000
})

const newRemoteServer = ref({
  name: '',
  url: '',
  headers: [] as { key: string; value: string }[],
  oauthEnabled: true,
  clientId: '',
  clientSecret: '',
  scope: '',
  timeout: 30000
})

const presetTemplates = [
  {
    name: 'MiniMax',
    type: 'local' as const,
    description: 'MiniMax coding plan MCP',
    command: 'uvx',
    args: 'minimax-coding-plan-mcp',
    env: [
      { key: 'MINIMAX_API_KEY', value: '' },
      { key: 'MINIMAX_MCP_BASE_PATH', value: '' },
      { key: 'MINIMAX_API_HOST', value: 'https://api.minimaxi.com' },
      { key: 'MINIMAX_API_RESOURCE_MODE', value: 'url' }
    ]
  },
  {
    name: 'Filesystem',
    type: 'local' as const,
    description: 'Local file system access',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-filesystem /path/to/allowed/dir',
    env: []
  },
  {
    name: 'GitHub',
    type: 'local' as const,
    description: 'GitHub API integration',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-github',
    env: [{ key: 'GITHUB_TOKEN', value: '' }]
  },
  {
    name: 'Puppeteer',
    type: 'local' as const,
    description: 'Browser automation',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-puppeteer',
    env: []
  },
  {
    name: 'Memory',
    type: 'local' as const,
    description: 'Persistent memory storage',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-memory',
    env: []
  },
  {
    name: 'SQLite',
    type: 'local' as const,
    description: 'SQLite database access',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-sqlite --db-path /path/to/database.db',
    env: []
  },
  {
    name: 'Brave Search',
    type: 'local' as const,
    description: 'Web search via Brave',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-brave-search',
    env: [{ key: 'BRAVE_API_KEY', value: '' }]
  }
]

const connectedCount = computed(() => {
  let count = 0
  for (const state of mcpStore.serverStates.values()) {
    if (state.status === 'connected') count++
  }
  return count
})

const totalTools = computed(() => mcpStore.allTools.length)
const totalResources = computed(() => mcpStore.allResources.length)
const totalPrompts = computed(() => mcpStore.allPrompts.length)

onMounted(async () => {
  if (mcpStore.servers.length === 0) {
    await loadServers()
  }
})

async function loadServers() {
  await mcpStore.loadFromApi()
}

async function saveServers() {
  try {
    await api.saveMCPServers(mcpStore.servers)
  } catch (error) {
    console.error('Failed to save MCP servers:', error)
  }
}

function openAddModal(template?: typeof presetTemplates[0]) {
  editingServer.value = null
  selectedServer.value = null

  if (template) {
    serverType.value = template.type
    newLocalServer.value = {
      name: template.name,
      command: template.command,
      args: template.args,
      env: template.env.map(e => ({ ...e })),
      timeout: 30000
    }
  } else {
    resetForms()
  }
  showTemplatesModal.value = false
  showAddModal.value = true
}

function openEditModal(server: MCPServer) {
  editingServer.value = server
  selectedServer.value = null

  if (server.config.type === 'local') {
    serverType.value = 'local'
    const config = server.config as McpLocalConfig
    newLocalServer.value = {
      name: server.name,
      command: config.command[0] || '',
      args: config.command.slice(1).join(' '),
      env: Object.entries(config.environment || {}).map(([key, value]) => ({ key, value })),
      timeout: config.timeout || 30000
    }
  } else {
    serverType.value = 'remote'
    const config = server.config as McpRemoteConfig
    newRemoteServer.value = {
      name: server.name,
      url: config.url,
      headers: Object.entries(config.headers || {}).map(([key, value]) => ({ key, value })),
      oauthEnabled: config.oauth !== false,
      clientId: typeof config.oauth === 'object' ? config.oauth.clientId || '' : '',
      clientSecret: typeof config.oauth === 'object' ? config.oauth.clientSecret || '' : '',
      scope: typeof config.oauth === 'object' ? config.oauth.scope || '' : '',
      timeout: config.timeout || 30000
    }
  }
  showAddModal.value = true
}

function resetForms() {
  serverType.value = 'local'
  newLocalServer.value = { name: '', command: 'npx', args: '', env: [], timeout: 30000 }
  newRemoteServer.value = { name: '', url: '', headers: [], oauthEnabled: true, clientId: '', clientSecret: '', scope: '', timeout: 30000 }
}

function addEnvVar() {
  newLocalServer.value.env.push({ key: '', value: '' })
}

function removeEnvVar(index: number) {
  newLocalServer.value.env.splice(index, 1)
}

function addHeader() {
  newRemoteServer.value.headers.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  newRemoteServer.value.headers.splice(index, 1)
}

async function saveServer() {
  if (serverType.value === 'local') {
    const envObj: Record<string, string> = {}
    for (const e of newLocalServer.value.env) {
      if (e.key) envObj[e.key] = e.value
    }

    const config: McpLocalConfig = {
      type: 'local',
      command: [newLocalServer.value.command, ...newLocalServer.value.args.split(' ').filter(Boolean)],
      environment: envObj,
      timeout: newLocalServer.value.timeout
    }

    if (editingServer.value) {
      mcpStore.updateServer(editingServer.value.id, { name: newLocalServer.value.name, config })
    } else {
      mcpStore.addServer({ name: newLocalServer.value.name, config })
    }
  } else {
    const headersObj: Record<string, string> = {}
    for (const h of newRemoteServer.value.headers) {
      if (h.key) headersObj[h.key] = h.value
    }

    const config: McpRemoteConfig = {
      type: 'remote',
      url: newRemoteServer.value.url,
      headers: headersObj,
      timeout: newRemoteServer.value.timeout
    }

    if (newRemoteServer.value.oauthEnabled) {
      config.oauth = {
        clientId: newRemoteServer.value.clientId || undefined,
        clientSecret: newRemoteServer.value.clientSecret || undefined,
        scope: newRemoteServer.value.scope || undefined
      }
    } else {
      config.oauth = false
    }

    if (editingServer.value) {
      mcpStore.updateServer(editingServer.value.id, { name: newRemoteServer.value.name, config })
    } else {
      mcpStore.addServer({ name: newRemoteServer.value.name, config })
    }
  }

  await saveServers()
  showAddModal.value = false
  editingServer.value = null
  resetForms()
}

async function deleteServer(id: string) {
  const server = mcpStore.servers.find(s => s.id === id)
  if (!server) return
  
  serverToDelete.value = server
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!serverToDelete.value) return
  
  try {
    await api.deleteMCPServer(serverToDelete.value.id)
    mcpStore.removeServer(serverToDelete.value.id)
    await saveServers()
  } catch (error) {
    console.error('Failed to delete MCP server:', error)
  } finally {
    showDeleteConfirm.value = false
    serverToDelete.value = null
  }
}

async function connectServer(server: MCPServer) {
  mcpStore.setServerState(server.id, { status: 'connecting' })

  try {
    const data = await api.initializeMCPServer(server.id)

    if (data.needsAuth) {
      mcpStore.setServerState(server.id, { status: 'needs_auth' })
      return
    }

    if (data.success) {
      mcpStore.setServerState(server.id, {
        status: 'connected',
        tools: (data.tools || []).map((t: any) => ({ ...t, serverId: server.id, serverName: server.name })),
        resources: (data.resources || []).map((r: any) => ({ ...r, serverId: server.id, serverName: server.name })),
        prompts: (data.prompts || []).map((p: any) => ({ ...p, serverId: server.id, serverName: server.name }))
      })
    } else if (data.disabled) {
      mcpStore.setServerState(server.id, { status: 'idle' })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    mcpStore.setServerState(server.id, { status: 'error', error: message })
  }
}

async function startAuth(server: MCPServer) {
  try {
    const data = await api.startMCPAuth(server.id)
    if (data.status === 'needs_auth') {
      alert(t('page.mcpServers.openBrowser'))
    } else if (data.status === 'already_authenticated') {
      await connectServer(server)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Auth failed'
    alert(message)
  }
}

async function disconnectServer(server: MCPServer) {
  try {
    await api.deleteMCPServer(server.id)
    mcpStore.setServerState(server.id, { status: 'idle', tools: [], resources: [], prompts: [] })
  } catch (error) {
    console.error('Failed to disconnect:', error)
  }
}

function viewServerDetail(server: MCPServer) {
  selectedServer.value = server
  showDetailModal.value = true
}

function getServerStatus(serverId: string): ServerStatus {
  return mcpStore.getServerState(serverId)?.status || 'idle'
}

function getStatusIcon(status: ServerStatus) {
  switch (status) {
    case 'connected': return CheckCircle
    case 'connecting': return Clock
    case 'error': return AlertCircle
    case 'needs_auth': return Key
    default: return Server
  }
}

function getStatusColor(status: ServerStatus): string {
  switch (status) {
    case 'connected': return 'var(--color-success)'
    case 'connecting': return 'var(--color-warning)'
    case 'error': return 'var(--color-error)'
    case 'needs_auth': return 'var(--color-warning)'
    default: return 'var(--text-muted)'
  }
}

function getStatusText(status: ServerStatus): string {
  switch (status) {
    case 'connected': return t('page.mcpServers.connected')
    case 'connecting': return t('common.loading')
    case 'error': return t('common.error')
    case 'needs_auth': return t('page.mcpServers.needsAuth')
    default: return t('page.mcpServers.connect')
  }
}

function getServerTypeIcon(server: MCPServer) {
  return server.config.type === 'remote' ? Link2 : Server
}

function getServerTypeText(server: MCPServer): string {
  return server.config.type === 'remote' ? 'Remote' : 'Local'
}

function getServerCommand(server: MCPServer): string {
  if (server.config.type === 'local') {
    return (server.config as McpLocalConfig).command.join(' ')
  }
  return (server.config as McpRemoteConfig).url
}

function openJsonModal() {
  jsonInput.value = ''
  jsonError.value = ''
  showJsonModal.value = true
}

async function importFromJson() {
  jsonError.value = ''
  
  try {
    const parsed = JSON.parse(jsonInput.value)
    
    const servers: MCPServer[] = []
    
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const server = parseServerConfig(item)
        if (server) servers.push(server)
      }
    } else if (parsed.mcpServers) {
      for (const [name, config] of Object.entries(parsed.mcpServers)) {
        const server = parseServerConfig(config as Record<string, unknown>, name)
        if (server) servers.push(server)
      }
    } else {
      const server = parseServerConfig(parsed)
      if (server) servers.push(server)
    }
    
    if (servers.length === 0) {
      jsonError.value = t('page.mcpServers.jsonParseError')
      return
    }
    
    for (const server of servers) {
      mcpStore.addServer({ name: server.name, config: server.config })
    }
    
    await saveServers()
    showJsonModal.value = false
    jsonInput.value = ''
  } catch (e) {
    jsonError.value = t('page.mcpServers.jsonInvalid')
  }
}

function parseServerConfig(item: Record<string, unknown>, defaultName?: string): MCPServer | null {
  if (!item || typeof item !== 'object') return null
  
  const name = (item.name as string) || defaultName || 'Unnamed Server'
  
  if (item.type === 'remote' && item.url) {
    return {
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      name,
      config: {
        type: 'remote',
        url: item.url as string,
        headers: item.headers as Record<string, string> | undefined,
        oauth: item.oauth as McpRemoteConfig['oauth'],
        timeout: (item.timeout as number) || 30000
      }
    }
  }
  
  if (item.command || item.args || item.type === 'local') {
    const command: string[] = []
    if (item.command) {
      command.push(item.command as string)
      if (item.args) {
        if (Array.isArray(item.args)) {
          command.push(...item.args as string[])
        } else if (typeof item.args === 'string') {
          command.push(...(item.args as string).split(' ').filter(Boolean))
        }
      }
    }
    
    return {
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      name,
      config: {
        type: 'local',
        command,
        environment: item.env as Record<string, string> | undefined,
        timeout: (item.timeout as number) || 30000
      }
    }
  }
  
  return null
}
</script>

<template>
  <div class="mcp-page">
    <div class="page-header">
      <div class="header-left">
        <h1>{{ t('page.mcpServers.title') }}</h1>
        <p class="subtitle">{{ t('page.mcpServers.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="showTemplatesModal = true">
          <Globe :size="16" />
          {{ t('page.mcpServers.fromTemplate') }}
        </button>
        <button class="btn btn-secondary" @click="openJsonModal">
          <FileText :size="16" />
          {{ t('page.mcpServers.fromJson') }}
        </button>
        <button class="btn btn-primary" @click="openAddModal()">
          <Plus :size="16" />
          {{ t('page.mcpServers.addServer') }}
        </button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-value">{{ connectedCount }}/{{ mcpStore.servers.length }}</div>
        <div class="stat-label">{{ t('page.mcpServers.serversConnected') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalTools }}</div>
        <div class="stat-label">{{ t('page.mcpServers.toolsAvailable') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalResources }}</div>
        <div class="stat-label">{{ t('page.mcpServers.resourcesAvailable') }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalPrompts }}</div>
        <div class="stat-label">{{ t('page.mcpServers.promptsAvailable') }}</div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="mcpStore.servers.length === 0" class="empty-state">
      <div class="empty-icon">
        <Wrench :size="48" />
      </div>
      <h3>{{ t('page.mcpServers.noServers') }}</h3>
      <p>{{ t('page.mcpServers.noServersHint') }}</p>
      <div class="empty-actions">
        <button class="btn btn-secondary" @click="showTemplatesModal = true">
          <Globe :size="16" />
          {{ t('page.mcpServers.fromTemplate') }}
        </button>
        <button class="btn btn-primary" @click="openAddModal()">
          <Plus :size="16" />
          {{ t('page.mcpServers.addServer') }}
        </button>
      </div>
    </div>

    <div v-else class="server-list">
      <div v-for="server in mcpStore.servers" :key="server.id" class="server-card" :class="{ connected: getServerStatus(server.id) === 'connected' }">
        <div class="card-main" @click="viewServerDetail(server)">
          <div class="card-header">
            <div class="server-info">
              <div class="server-icon" :style="{ background: getStatusColor(getServerStatus(server.id)) }">
                <component :is="getServerTypeIcon(server)" :size="18" />
              </div>
              <div class="server-meta">
                <h3 class="server-name">{{ server.name }}</h3>
                <span class="server-type">{{ getServerTypeText(server) }}</span>
              </div>
            </div>
            <div class="status-badge" :style="{ background: getStatusColor(getServerStatus(server.id)) }">
              <component :is="getStatusIcon(getServerStatus(server.id))" :size="12" />
              <span>{{ getStatusText(getServerStatus(server.id)) }}</span>
            </div>
          </div>

          <div class="card-body">
            <div class="command-line">
              <code>{{ getServerCommand(server) }}</code>
            </div>

            <div class="server-stats" v-if="getServerStatus(server.id) === 'connected'">
              <div class="stat" v-if="mcpStore.getServerState(server.id)?.tools?.length">
                <Wrench :size="12" />
                <span>{{ mcpStore.getServerState(server.id)?.tools?.length }}</span>
              </div>
              <div class="stat" v-if="mcpStore.getServerState(server.id)?.resources?.length">
                <FileText :size="12" />
                <span>{{ mcpStore.getServerState(server.id)?.resources?.length }}</span>
              </div>
              <div class="stat" v-if="mcpStore.getServerState(server.id)?.prompts?.length">
                <MessageSquare :size="12" />
                <span>{{ mcpStore.getServerState(server.id)?.prompts?.length }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button
            v-if="getServerStatus(server.id) === 'idle' || getServerStatus(server.id) === 'error'"
            class="btn btn-sm btn-primary"
            @click="connectServer(server)"
          >
            <Play :size="14" />
            {{ t('page.mcpServers.connect') }}
          </button>
          <button
            v-else-if="getServerStatus(server.id) === 'needs_auth'"
            class="btn btn-sm btn-warning"
            @click="startAuth(server)"
          >
            <Key :size="14" />
            {{ t('page.mcpServers.authorize') }}
          </button>
          <button
            v-else-if="getServerStatus(server.id) === 'connected'"
            class="btn btn-sm btn-secondary"
            @click="disconnectServer(server)"
          >
            <RefreshCw :size="14" />
            {{ t('page.mcpServers.disconnect') }}
          </button>
          <button v-else class="btn btn-sm" disabled>
            <Clock :size="14" />
            {{ t('common.loading') }}
          </button>

          <button class="btn btn-sm btn-icon" @click="openEditModal(server)">
            <Settings :size="14" />
          </button>
          <button class="btn btn-sm btn-icon btn-danger" @click="deleteServer(server.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal modal-large">
          <div class="modal-header">
          <h3>{{ editingServer ? t('page.mcpServers.editServer') : t('page.mcpServers.addServer') }}</h3>
          <button class="modal-close" @click="showAddModal = false">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="type-tabs">
            <button class="type-tab" :class="{ active: serverType === 'local' }" @click="serverType = 'local'">
              <Server :size="16" />
              {{ t('page.mcpServers.localServer') }}
            </button>
            <button class="type-tab" :class="{ active: serverType === 'remote' }" @click="serverType = 'remote'">
              <Link2 :size="16" />
              {{ t('page.mcpServers.remoteServer') }}
            </button>
          </div>

          <template v-if="serverType === 'local'">
            <div class="form-group">
              <label>{{ t('page.mcpServers.serverName') }}</label>
              <input v-model="newLocalServer.name" type="text" class="input" :placeholder="t('page.mcpServers.serverNamePlaceholder')" />
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label>{{ t('page.mcpServers.command') }}</label>
                <input v-model="newLocalServer.command" type="text" class="input" placeholder="npx, uvx, node..." />
              </div>
              <div class="form-group flex-2">
                <label>{{ t('page.mcpServers.args') }}</label>
                <input v-model="newLocalServer.args" type="text" class="input" placeholder="-y @modelcontextprotocol/server-filesystem /path" />
              </div>
            </div>

            <div class="form-group">
              <label>{{ t('page.mcpServers.envVars') }}</label>
              <div class="env-editor">
                <div v-for="(env, index) in newLocalServer.env" :key="index" class="env-row">
                  <input v-model="env.key" type="text" class="input env-key" placeholder="KEY" />
                  <input v-model="env.value" type="password" class="input env-value" placeholder="value" />
                  <button class="btn btn-sm btn-icon-only btn-danger" @click="removeEnvVar(index)">
                    <X :size="14" />
                  </button>
                </div>
                <button class="btn btn-sm btn-secondary" @click="addEnvVar">
                  <Plus :size="14" />
                  {{ t('page.mcpServers.addEnvVar') }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="form-group">
              <label>{{ t('page.mcpServers.serverName') }}</label>
              <input v-model="newRemoteServer.name" type="text" class="input" :placeholder="t('page.mcpServers.serverNamePlaceholder')" />
            </div>

            <div class="form-group">
              <label>{{ t('page.mcpServers.serverUrl') }}</label>
              <input v-model="newRemoteServer.url" type="text" class="input" placeholder="https://example.com/mcp" />
            </div>

            <div class="form-group">
              <label>{{ t('page.mcpServers.headers') }}</label>
              <div class="env-editor">
                <div v-for="(header, index) in newRemoteServer.headers" :key="index" class="env-row">
                  <input v-model="header.key" type="text" class="input env-key" placeholder="Header-Name" />
                  <input v-model="header.value" type="text" class="input env-value" placeholder="value" />
                  <button class="btn btn-sm btn-icon-only btn-danger" @click="removeHeader(index)">
                    <X :size="14" />
                  </button>
                </div>
                <button class="btn btn-sm btn-secondary" @click="addHeader">
                  <Plus :size="14" />
                  {{ t('page.mcpServers.addHeader') }}
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="newRemoteServer.oauthEnabled" />
                <span>{{ t('page.mcpServers.enableOAuth') }}</span>
              </label>
            </div>

            <template v-if="newRemoteServer.oauthEnabled">
              <div class="form-row">
                <div class="form-group flex-1">
                  <label>{{ t('page.mcpServers.clientId') }}</label>
                  <input v-model="newRemoteServer.clientId" type="text" class="input" :placeholder="t('page.mcpServers.optional')" />
                </div>
                <div class="form-group flex-1">
                  <label>{{ t('page.mcpServers.clientSecret') }}</label>
                  <input v-model="newRemoteServer.clientSecret" type="password" class="input" :placeholder="t('page.mcpServers.optional')" />
                </div>
              </div>
              <div class="form-group">
                <label>{{ t('page.mcpServers.scope') }}</label>
                <input v-model="newRemoteServer.scope" type="text" class="input" :placeholder="t('page.mcpServers.optional')" />
              </div>
            </template>
          </template>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAddModal = false">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="saveServer" :disabled="serverType === 'local' ? !newLocalServer.name || !newLocalServer.command : !newRemoteServer.name || !newRemoteServer.url">
            {{ t('common.save') }}
          </button>
        </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showTemplatesModal" class="modal-overlay" @click.self="showTemplatesModal = false">
        <div class="modal modal-large">
          <div class="modal-header">
          <h3>{{ t('page.mcpServers.templates') }}</h3>
          <button class="modal-close" @click="showTemplatesModal = false">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body preset-list">
          <div v-for="template in presetTemplates" :key="template.name" class="preset-item" @click="openAddModal(template)">
            <div class="preset-icon">
              <Server :size="20" />
            </div>
            <div class="preset-content">
              <div class="preset-name">{{ template.name }}</div>
              <div class="preset-desc">{{ template.description }}</div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showDetailModal && selectedServer" class="modal-overlay" @click.self="showDetailModal = false">
        <div class="modal modal-large">
          <div class="modal-header">
          <h3>{{ selectedServer.name }}</h3>
          <button class="modal-close" @click="showDetailModal = false">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="detail-section">
            <h4>{{ t('page.mcpServers.tools') }}</h4>
            <div v-if="mcpStore.getServerState(selectedServer.id)?.tools?.length" class="tools-list">
              <div v-for="tool in mcpStore.getServerState(selectedServer.id)?.tools" :key="tool.name" class="tool-item">
                <div class="tool-name">{{ tool.name }}</div>
                <div class="tool-desc">{{ tool.description }}</div>
              </div>
            </div>
            <div v-else class="empty-hint">{{ t('page.mcpServers.noTools') }}</div>
          </div>

          <div class="detail-section">
            <h4>{{ t('page.mcpServers.resources') }}</h4>
            <div v-if="mcpStore.getServerState(selectedServer.id)?.resources?.length" class="resources-list">
              <div v-for="resource in mcpStore.getServerState(selectedServer.id)?.resources" :key="resource.uri" class="resource-item">
                <div class="resource-name">{{ resource.name }}</div>
                <div class="resource-uri">{{ resource.uri }}</div>
              </div>
            </div>
            <div v-else class="empty-hint">{{ t('page.mcpServers.noResources') }}</div>
          </div>

          <div class="detail-section">
            <h4>{{ t('page.mcpServers.prompts') }}</h4>
            <div v-if="mcpStore.getServerState(selectedServer.id)?.prompts?.length" class="prompts-list">
              <div v-for="prompt in mcpStore.getServerState(selectedServer.id)?.prompts" :key="prompt.name" class="prompt-item">
                <div class="prompt-name">{{ prompt.name }}</div>
                <div class="prompt-desc">{{ prompt.description }}</div>
              </div>
            </div>
            <div v-else class="empty-hint">{{ t('page.mcpServers.noPrompts') }}</div>
          </div>
        </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showJsonModal" class="modal-overlay" @click.self="showJsonModal = false">
        <div class="modal modal-large">
          <div class="modal-header">
          <h3>{{ t('page.mcpServers.fromJson') }}</h3>
          <button class="modal-close" @click="showJsonModal = false">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('page.mcpServers.jsonConfig') }}</label>
            <textarea
              v-model="jsonInput"
              class="input json-textarea"
              :placeholder="t('page.mcpServers.jsonPlaceholder')"
              rows="12"
            ></textarea>
          </div>
          <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showJsonModal = false">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="importFromJson" :disabled="!jsonInput.trim()">
            {{ t('page.mcpServers.import') }}
          </button>
        </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
        <div class="modal modal-small">
          <div class="modal-header">
            <h3>{{ t('page.mcpServers.confirmDeleteTitle') }}</h3>
            <button class="modal-close" @click="showDeleteConfirm = false">
              <X :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <p class="confirm-text">{{ t('page.mcpServers.confirmDelete') }}</p>
            <p v-if="serverToDelete" class="confirm-server-name">{{ serverToDelete.name }}</p>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-danger" @click="confirmDelete">{{ t('common.delete') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mcp-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px 20px;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 100px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  color: var(--text-muted);
}

.empty-state h3 {
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-state p {
  color: var(--text-muted);
  margin-bottom: 24px;
}

.empty-actions {
  display: flex;
  gap: 12px;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 16px;
  transition: all 0.2s;
}

.server-card:hover {
  border-color: var(--accent-primary);
}

.server-card.connected {
  border-color: var(--color-success);
}

.card-main {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.server-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.server-meta {
  min-width: 0;
}

.server-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.server-type {
  font-size: 12px;
  color: var(--text-muted);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.card-body {
  display: flex;
  align-items: center;
  gap: 16px;
}

.command-line {
  flex: 1;
  min-width: 0;
}

.command-line code {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 8px 12px;
  border-radius: 6px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-stats {
  display: flex;
  gap: 12px;
}

.server-stats .stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 4px 8px;
  border-radius: 4px;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-left: 16px;
}

.btn-warning {
  background: var(--color-warning);
  color: white;
}

.btn-warning:hover {
  filter: brightness(1.1);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg-primary) 58%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-large {
  width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}

.type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.type-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.type-tab:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.type-tab.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-muted);
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.env-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-row {
  display: flex;
  gap: 8px;
}

.env-key { width: 140px; flex-shrink: 0; }
.env-value { flex: 1; }

.btn-icon-only { padding: 8px; }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.preset-item:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.preset-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
  flex-shrink: 0;
}

.preset-content {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
}

.preset-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-muted);
}

.tools-list, .resources-list, .prompts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item, .resource-item, .prompt-item {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 12px;
}

.tool-name, .resource-name, .prompt-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.tool-desc, .prompt-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.resource-uri {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.empty-hint {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: scale(0.95);
  opacity: 0;
}

.json-textarea {
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  min-height: 200px;
}

.json-error {
  color: var(--color-error);
  font-size: 13px;
  margin-top: 8px;
}

.modal-small {
  max-width: 400px;
}

.confirm-text {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.confirm-server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-primary);
  background: var(--bg-primary);
  padding: 8px 12px;
  border-radius: 6px;
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover {
  filter: brightness(1.1);
}
</style>
