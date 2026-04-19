<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessageSquare, ChevronDown, Check, Wrench, Gauge } from 'lucide-vue-next'
import ConversationsSidebar from '@/components/chat/ConversationsSidebar.vue'
import MessageItem from '@/components/chat/MessageItem.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import { useConversationsStore, useAgentsStore, useProvidersStore, useToolsStore } from '@/stores'
import { useI18n } from '@/i18n'
import type { ConversationUsage } from '@/services/conversations'

const LAST_CONVERSATION_ROUTE_KEY = 'fishboss:last-conversation-route'

const route = useRoute()
const router = useRouter()
const store = useConversationsStore()
const agentsStore = useAgentsStore()
const providersStore = useProvidersStore()
const toolsStore = useToolsStore()
const { t } = useI18n()
const draft = ref('')
const agentDropdownOpen = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const isHydratingConversation = ref(false)
const isViewportReady = ref(false)

const conversationId = computed(() => route.params.id as string | undefined)
const currentConversation = computed(() => store.currentConversation)
const messages = computed(() =>
  (currentConversation.value?.messages ?? []).filter((message) => message.role !== 'tool')
)
const conversations = computed(() =>
  store.conversations.map((conversation) => ({
    ...conversation,
    isRunning: store.streamingConversationId === conversation.id
  }))
)
const enabledAgents = computed(() => agentsStore.agents)
const selectedAgent = computed(() => agentsStore.currentAgent)
const selectedAgentName = computed(() => selectedAgent.value?.name ?? '')
const selectedAgentTools = computed(() => {
  const allowedTools = selectedAgent.value?.toolPermissions?.allowedTools ?? selectedAgent.value?.tools ?? []
  const deniedTools = selectedAgent.value?.toolPermissions?.deniedTools ?? []
  return allowedTools.filter((tool) => !deniedTools.includes(tool))
})
const selectedAgentExecutableTools = computed(() => {
  const executableToolIds = new Set(
    toolsStore.tools
      .filter((tool) => tool.executable)
      .map((tool) => tool.id)
  )
  return selectedAgentTools.value.filter((tool) => executableToolIds.has(tool))
})
const toolCapabilityEnabled = computed(() => selectedAgentExecutableTools.value.length > 0)
const toolCapabilityLabel = computed(() =>
  toolCapabilityEnabled.value ? t('chat.toolCapabilityEnabled') : t('chat.toolCapabilityDisabled')
)
const effectiveProviderId = computed(() => currentConversation.value?.metadata?.providerId ?? selectedAgent.value?.provider ?? null)
const effectiveModelId = computed(() => currentConversation.value?.metadata?.modelId ?? selectedAgent.value?.model ?? null)
const effectiveProviderModels = computed(() => {
  const providerId = effectiveProviderId.value
  if (!providerId) {
    return []
  }
  return providersStore.providerModels[providerId] ?? []
})
const effectiveContextWindow = computed(() => {
  const modelId = effectiveModelId.value
  if (!modelId) {
    return 0
  }
  const model = effectiveProviderModels.value.find((item) => item.id === modelId)
  return model?.contextWindow ?? 0
})
const latestAssistantUsage = computed<ConversationUsage | null>(() => {
  const currentMessages = messages.value
  for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
    const message = currentMessages[index]
    if (message.role !== 'assistant') {
      continue
    }
    const usage = message.metadata?.usage
    if (usage?.totalTokens !== undefined || usage?.promptTokens !== undefined || usage?.completionTokens !== undefined) {
      return usage
    }
    if (typeof message.metadata?.tokens === 'number') {
      return { totalTokens: message.metadata.tokens }
    }
  }
  return null
})
const contextUsage = computed(() => {
  const contextWindow = effectiveContextWindow.value
  const usage = latestAssistantUsage.value?.totalTokens
  if (!contextWindow || usage === undefined) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((usage / contextWindow) * 100)))
})

onMounted(async () => {
  await Promise.all([
    store.fetchConversations(),
    agentsStore.fetchAgents(),
    providersStore.fetchProviders(),
    toolsStore.fetchTools()
  ])

  if (!agentsStore.currentAgent && agentsStore.agents.length > 0) {
    agentsStore.setCurrentAgent(agentsStore.agents[0])
  }

  await syncConversationFromRoute(conversationId.value)
})

watch(conversationId, async (newId) => {
  await syncConversationFromRoute(newId)
})

watch(conversationId, (newId) => {
  if (!newId) return
  window.sessionStorage.setItem(LAST_CONVERSATION_ROUTE_KEY, `/conversations/${newId}`)
})

watch(messages, () => {
  if (isHydratingConversation.value) {
    return
  }
  void scrollToBottom()
}, { deep: true })

watch(effectiveProviderId, async (providerId) => {
  if (!providerId || providersStore.providerModels[providerId]) {
    return
  }
  try {
    await providersStore.loadModels(providerId)
  } catch (error) {
    console.error('Failed to load provider models for context usage', error)
  }
}, { immediate: true })

function selectAgent(id: string) {
  const agent = agentsStore.agents.find(a => a.id === id)
  if (agent) {
    agentsStore.setCurrentAgent(agent)
  }
  agentDropdownOpen.value = false
}

async function handleSend() {
  const content = draft.value.trim()
  if (!content) return
  draft.value = ''
  const agent = agentsStore.currentAgent
  const shouldOpenRoute = !store.currentConversation
  const conversation = shouldOpenRoute
    ? await store.createConversation({
        title: store.buildConversationTitle(content),
        metadata: {
          agentId: agent?.id,
          providerId: agent?.provider,
          modelId: agent?.model
        }
      })
    : null

  if (conversation) {
    await router.replace(`/conversations/${conversation.id}`)
  }

  await store.sendMessage(content, {
    agentId: agent?.id,
    provider: agent?.provider,
    model: agent?.model,
    tools: selectedAgentExecutableTools.value
  })
}

async function handleCreateConversation() {
  store.openNewConversation()
  if (route.fullPath !== '/conversations?mode=new') {
    await router.push('/conversations?mode=new')
  }
}

async function handleSelectConversation(id: string) {
  if (id === conversationId.value) {
    return
  }
  await router.push(`/conversations/${id}`)
}

async function handleDeleteConversation(id: string) {
  if (window.sessionStorage.getItem(LAST_CONVERSATION_ROUTE_KEY) === `/conversations/${id}`) {
    window.sessionStorage.removeItem(LAST_CONVERSATION_ROUTE_KEY)
  }
  await store.deleteConversation(id)
  if (id === conversationId.value) {
    if (store.conversations[0]) {
      await router.push(`/conversations/${store.conversations[0].id}`)
    } else {
      await router.push('/conversations')
    }
  }
}

async function syncConversationFromRoute(id: string | undefined) {
  isHydratingConversation.value = true
  isViewportReady.value = false

  if (!id) {
    if (route.query.mode !== 'new') {
      const lastConversationRoute = window.sessionStorage.getItem(LAST_CONVERSATION_ROUTE_KEY)
      const lastConversationId = lastConversationRoute?.split('/').pop()
      if (lastConversationRoute && lastConversationId && store.conversations.some((item) => item.id === lastConversationId)) {
        await router.replace(lastConversationRoute)
        return
      }
    }

    store.openNewConversation()
    await scrollToBottom()
    isHydratingConversation.value = false
    isViewportReady.value = true
    return
  }

  if (store.currentConversation?.id === id) {
    await scrollToBottom()
    isHydratingConversation.value = false
    isViewportReady.value = true
    return
  }

  let conversation
  try {
    conversation = await store.fetchConversation(id)
  } catch {
    if (window.sessionStorage.getItem(LAST_CONVERSATION_ROUTE_KEY) === `/conversations/${id}`) {
      window.sessionStorage.removeItem(LAST_CONVERSATION_ROUTE_KEY)
    }
    isHydratingConversation.value = false
    isViewportReady.value = true
    await router.replace('/conversations')
    return
  }

  const agentId = conversation.metadata?.agentId
  if (agentId) {
    const agent = agentsStore.agents.find((item) => item.id === agentId)
    if (agent) {
      agentsStore.setCurrentAgent(agent)
    }
  }

  await scrollToBottom()
  isHydratingConversation.value = false
  isViewportReady.value = true
}

async function scrollToBottom() {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const container = messagesRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}
</script>

<template>
  <div class="chat-view">
    <ConversationsSidebar
      :conversations="conversations"
      :current-id="conversationId ?? null"
      @clear="handleCreateConversation"
      @select="handleSelectConversation"
      @delete="handleDeleteConversation"
    />

    <div class="chat-container">
      <div class="agent-selector">
        <label class="selector-label">{{ t('common.agent') }}:</label>
        <div class="custom-select">
          <button class="select-trigger" @click="agentDropdownOpen = !agentDropdownOpen">
            <span>{{ selectedAgentName || t('chat.selectAgent') }}</span>
            <ChevronDown :size="16" :class="['chevron', { rotated: agentDropdownOpen }]" />
          </button>
          <Transition name="dropdown">
            <div v-if="agentDropdownOpen" class="select-dropdown">
              <button
                v-for="agent in enabledAgents"
                :key="agent.id"
                :class="['select-option', { active: selectedAgent?.id === agent.id }]"
                @click="selectAgent(agent.id)"
              >
                <span>{{ agent.name }}</span>
                <Check v-if="selectedAgent?.id === agent.id" :size="14" />
              </button>
            </div>
          </Transition>
        </div>
        <div class="tool-status" :class="{ inactive: !toolCapabilityEnabled }">
          <span class="tool-status-label">
            <Wrench :size="16" />
            <span>{{ t('chat.toolCapability') }}</span>
          </span>
          <span class="tool-status-value">{{ toolCapabilityLabel }}</span>
        </div>
        <div class="context-indicator">
          <Gauge :size="14" />
          <span :class="['context-usage', { warning: contextUsage > 70, critical: contextUsage > 90 }]">
            {{ contextUsage }}%
          </span>
        </div>
      </div>

      <div class="messages-wrapper">
        <div ref="messagesRef" :class="['messages', { 'messages-pending': !isViewportReady }]">
          <div v-if="messages.length === 0 && !store.isStreaming" class="empty-state">
            <div class="empty-icon-wrap"><MessageSquare :size="28" /></div>
            <p>{{ t('chat.emptyStateText') }}</p>
          </div>

          <MessageItem v-for="message in messages" :key="message.id" :msg="message" />
        </div>
      </div>

      <ChatInput
        v-model="draft"
        :is-thinking="store.isStreaming"
        :placeholder="store.isStreaming ? t('chat.inputPlaceholderQueue') : t('chat.inputPlaceholder')"
        @send="handleSend"
        @queue-or-stop="store.stopStreaming()"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.chat-container {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.messages-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.messages {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-gutter: stable;
  scroll-behavior: auto;
  transition: opacity 120ms ease;
}

.messages.messages-pending {
  opacity: 0;
}

.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}

.empty-icon-wrap {
  width: 80px;
  height: 80px;
  opacity: 0.5;
}

.empty-icon-wrap svg {
  width: 100%;
  height: 100%;
}

.agent-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.selector-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 4px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.tool-status.inactive {
  color: var(--text-muted);
}

.tool-status-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-status-value {
  color: var(--text-primary);
  font-weight: 600;
}

.tool-status.inactive .tool-status-value {
  color: var(--text-muted);
}

.context-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.context-indicator:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.context-usage {
  font-weight: 500;
}

.context-usage.warning {
  color: #f59e0b;
}

.context-usage.critical {
  color: #ef4444;
}

.custom-select {
  position: relative;
  flex: 1;
  max-width: 280px;
}

.select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-trigger:hover {
  border-color: var(--border-color-hover);
}

.select-trigger .chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.select-trigger .chevron.rotated {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px;
  z-index: 10;
  box-shadow: var(--shadow-md);
  max-height: 200px;
  overflow-y: auto;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-option:hover {
  background: var(--bg-hover);
}

.select-option.active {
  color: var(--accent-primary);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
