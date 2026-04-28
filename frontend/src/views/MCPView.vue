<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Boxes, Play, Plus, Square, Trash2, Wrench } from 'lucide-vue-next'
import { Card, CardContent } from '@/components'
import { useAppStore, useMCPStore } from '@/stores'
import { mcpApi } from '@/services/mcp'
import { useI18n } from '@/i18n'

const appStore = useAppStore()
const store = useMCPStore()
const { t } = useI18n()

const servers = computed(() => store.servers)
const connectedCount = computed(() => servers.value.filter((server) => server.status === 'running').length)
const totalTools = computed(() => tools.value.length)
const totalResources = computed(() => resources.value.length)
const totalPrompts = computed(() => 0)
const showAddModal = ref(false)
const selectedServerId = ref<string | null>(null)
const tools = ref<Array<Record<string, unknown>>>([])
const resources = ref<Array<Record<string, unknown>>>([])
const form = ref({
  name: '',
  command: 'npx',
  args: '',
  enabled: true,
  envText: ''
})

onMounted(async () => {
  await store.fetchServers()
})

async function runAction(action: 'startServer' | 'stopServer' | 'restartServer', id: string) {
  const result = await mcpApi[action](id)
  appStore.notify(result.success ? `${action} succeeded` : (result.error || `${action} failed`), result.success ? 'success' : 'error')
  await store.fetchServers()
}

async function inspectServer(id: string) {
  selectedServerId.value = id
  tools.value = await mcpApi.listTools(id)
  resources.value = await mcpApi.listResources(id)
}

async function addServer() {
  const env = Object.fromEntries(
    form.value.envText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split('=')
        return [key, rest.join('=')]
      })
  )

  await store.createServer({
    name: form.value.name,
    command: form.value.command,
    args: form.value.args.split(' ').filter(Boolean),
    env,
    enabled: form.value.enabled
  })

  showAddModal.value = false
  form.value = { name: '', command: 'npx', args: '', enabled: true, envText: '' }
}

async function removeServer(id: string) {
  await store.deleteServer(id)
  if (selectedServerId.value === id) {
    selectedServerId.value = null
    tools.value = []
    resources.value = []
  }
}
</script>

<template>
  <div class="mcp-view">
    <div class="mcp-header">
      <div class="header-left">
        <h2>{{ t('page.mcpServers.title') }}</h2>
        <p>{{ t('page.mcpServers.subtitle') }}</p>
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">
        <Plus :size="16" />
        {{ t('page.mcpServers.addServer') }}
      </button>
    </div>

    <div class="mcp-grid">
      <div class="stats-bar">
        <div class="stat-card">
          <div class="stat-value">{{ connectedCount }}/{{ servers.length }}</div>
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

      <div class="servers-panel">
        <div v-if="servers.length === 0" class="empty-state">
          <Boxes :size="48" class="empty-icon" />
          <h3>{{ t('page.mcpServers.noServers') }}</h3>
          <p>{{ t('page.mcpServers.noServersHint') }}</p>
        </div>

        <Card v-for="server in servers" :key="server.id" class="server-card card-hover">
          <CardContent class="server-content">
            <div class="server-header">
              <div>
                <h3 class="server-name">{{ server.name }}</h3>
                <p class="server-command">{{ server.command }} {{ server.args.join(' ') }}</p>
              </div>
              <span class="server-status">{{ server.status }}</span>
            </div>

            <div class="server-actions">
              <button class="btn btn-ghost btn-sm" @click="runAction('startServer', server.id)"><Play :size="14" /> {{ t('page.mcpServers.connect') }}</button>
              <button class="btn btn-ghost btn-sm" @click="runAction('stopServer', server.id)"><Square :size="14" /> {{ t('page.mcpServers.disconnect') }}</button>
              <button class="btn btn-ghost btn-sm" @click="inspectServer(server.id)"><Wrench :size="14" /> {{ t('page.mcpServers.tools') }}</button>
              <button class="btn btn-ghost btn-sm btn-danger" @click="removeServer(server.id)"><Trash2 :size="14" /> {{ t('common.delete') }}</button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="detail-panel">
        <Card>
          <CardContent class="detail-content">
            <h3>{{ t('page.mcpServers.tools') }}</h3>
            <div v-if="tools.length === 0" class="detail-empty">{{ t('page.mcpServers.noTools') }}</div>
            <div v-else class="detail-list">
              <div v-for="tool in tools" :key="String(tool.name)" class="detail-item">
                <strong>{{ tool.name }}</strong>
                <span>{{ tool.description }}</span>
              </div>
            </div>

            <h3>{{ t('page.mcpServers.resources') }}</h3>
            <div v-if="resources.length === 0" class="detail-empty">{{ t('page.mcpServers.noResources') }}</div>
            <div v-else class="detail-list">
              <div v-for="resource in resources" :key="String(resource.uri)" class="detail-item">
                <strong>{{ resource.name }}</strong>
                <span>{{ resource.uri }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ t('page.mcpServers.addServer') }}</h3>
            <button class="modal-close" @click="showAddModal = false"><AlertCircle :size="18" /></button>
          </div>
          <div class="modal-body form-grid">
            <input v-model="form.name" class="input" :placeholder="t('page.mcpServers.serverNamePlaceholder')" />
            <input v-model="form.command" class="input" :placeholder="t('page.mcpServers.command')" />
            <input v-model="form.args" class="input" :placeholder="t('page.mcpServers.args')" />
            <textarea v-model="form.envText" class="input" rows="5" :placeholder="`${t('page.mcpServers.envVars')}\nAPI_KEY=xxx`" />
            <div class="form-actions">
              <button class="btn btn-secondary" @click="showAddModal = false">{{ t('common.cancel') }}</button>
              <button class="btn btn-primary" @click="addServer">{{ t('page.mcpServers.addServer') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mcp-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.mcp-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.header-left h2 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.header-left p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.mcp-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  text-align: center;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--accent-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.servers-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all 0.2s;
}

.server-card:hover {
  border-color: var(--accent-primary);
}

.server-card.running {
  border-color: var(--status-success);
}

.server-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.server-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.server-command {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--text-muted);
  color: white;
}

.server-status.running {
  background: var(--status-success);
}

.server-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-panel {
  min-width: 0;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
}

.detail-item strong {
  font-weight: 500;
  font-size: 0.9rem;
}

.detail-item span {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.detail-empty,
.empty-state {
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 40px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
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

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
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
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
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
</style>
