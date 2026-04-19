<template>
  <div class="chat-view">
    <div class="conversations-sidebar">
      <div class="sidebar-header">
        <h3>{{ t('chat.conversations') }}</h3>
        <button class="btn btn-sm btn-secondary" @click="clearCurrentChat">
          <Plus :size="16" />
        </button>
      </div>
      <div class="conversation-list-wrapper">
        <div class="conversation-list" ref="conversationListEl">
          <div
            v-for="conv in conversationStore.sortedConversations"
            :key="conv.id"
            :class="['conversation-item', { active: conversationStore.currentConversation?.id === conv.id, running: isSessionThinking(conv.id) }]"
            @click="selectConversation(conv.id)"
          >
            <div class="conv-info">
              <span class="conv-title">
                <Loader2 v-if="isSessionThinking(conv.id)" :size="12" class="spin" />
                {{ conv.title }}
              </span>
              <span class="conv-meta">{{ formatDate(conv.updatedAt) }}</span>
            </div>
            <button class="conv-delete" @click.stop="deleteConversation(conv.id)">
              <Trash2 :size="14" />
            </button>
          </div>
          <div v-if="conversationStore.conversations.length === 0" class="empty-conversations">
            <MessageSquare :size="32" />
            <p>{{ t('chat.noConversations') }}</p>
          </div>
        </div>
      </div>
      <div v-if="displayTodos.length > 0" class="sidebar-todos">
        <div class="todos-header">
          <ListTodo :size="14" />
          <span>{{ t('chat.taskList') }}</span>
        </div>
        <div class="todos-list">
          <div v-for="todo in displayTodos" :key="todo.id" :class="['todo-item', todo.status]">
            <span class="todo-status-icon">
              <CheckCircle2 v-if="todo.status === 'completed'" :size="12" />
              <Loader2 v-else-if="todo.status === 'in_progress'" :size="12" class="spin" />
              <Circle v-else :size="12" />
            </span>
            <span class="todo-content">{{ todo.content }}</span>
          </div>
        </div>
      </div>
    </div>

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
                v-for="agent in agentsStore.enabledAgents"
                :key="agent.id"
                :class="['select-option', { active: selectedAgentId === agent.id }]"
                @click="selectAgent(agent.id)"
              >
                <span>{{ agent.name }}</span>
                <Check v-if="selectedAgentId === agent.id" :size="14" />
              </button>
            </div>
          </Transition>
        </div>
        <div class="tool-toggle">
          <label class="toggle-label">
            <Wrench :size="16" />
            <span>{{ t('chat.toolCall') }}</span>
          </label>
          <button 
            :class="['toggle-switch', { active: toolCallEnabled }]" 
            @click="toolCallEnabled = !toolCallEnabled"
          >
            <span class="toggle-thumb"></span>
          </button>
        </div>
        <div class="context-indicator" @click="showCompression = !showCompression">
          <Gauge :size="14" />
          <span :class="['context-usage', { warning: agentStream.contextUsage.value > 70, critical: agentStream.contextUsage.value > 90 }]">
            {{ Math.round(agentStream.contextUsage.value) }}%
          </span>
        </div>
      </div>

      <div class="messages-wrapper">
        <div class="messages" ref="messagesEl" @scroll="handleScroll">
          <div v-if="displayMessages.length === 0 && !agentStream.isStreaming.value" class="empty-state">
            <img src="/favicon.svg" alt="" class="empty-icon" />
            <p>{{ t('chat.emptyStateText') }}</p>
          </div>

          <template v-for="msg in displayMessages" :key="msg.id">
            <div v-if="msg.role === 'compressed'" class="message compressed">
              <div class="bubble-wrapper">
                <button class="compressed-toggle" @click="toggleThinking(msg.id)">
                  <FileText :size="14" />
                  <span>{{ t('chat.compressedContext') }}</span>
                  <ChevronDown :size="14" :class="{ rotated: expandedThinking.has(msg.id) }" />
                </button>
                <div v-if="expandedThinking.has(msg.id)" class="compressed-content-wrapper">
                  <div class="compressed-content">{{ msg.content }}</div>
                </div>
              </div>
            </div>
            <div v-else :class="['message', msg.role]">
              <div class="bubble-wrapper">
                <div v-if="msg.role === 'assistant' && msg.thinking" class="thinking-block">
                  <button class="thinking-toggle" @click="toggleThinking(msg.id)">
                    <Brain :size="14" />
                    <span>{{ t('chat.thinking') }}</span>
                    <ChevronDown :size="14" :class="{ rotated: expandedThinking.has(msg.id) }" />
                  </button>
                  <div v-if="expandedThinking.has(msg.id)" class="thinking-content-wrapper">
                    <div class="thinking-content">{{ msg.thinking }}</div>
                  </div>
                </div>
                <div v-if="msg.content && msg.content.trim()" :class="['bubble', msg.role]">
                  <MarkdownRenderer v-if="msg.role !== 'error'" :content="msg.content" />
                  <div v-else class="bubble-text">{{ msg.content }}</div>
                </div>
                <div v-if="msg.content && msg.content.trim() && msg.role !== 'error'" class="bubble-time">{{ formatTime(msg.timestamp) }}</div>
                <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="tool-calls-display">
                  <div v-for="tc in msg.toolCalls" :key="tc.id" :class="['tool-call-item', getToolCallStatus(tc)]">
                    <div class="tool-call-line">
                      <span class="tool-call-marker">
                        <Loader2 v-if="getToolCallStatus(tc) === 'pending' || getToolCallStatus(tc) === 'running'" :size="12" class="spin" />
                        <X v-else-if="getToolCallStatus(tc) === 'error'" :size="12" />
                        <Check v-else :size="12" />
                      </span>
                      <span class="tool-name">{{ tc.name }}</span>
                      <span class="tool-colon">:</span>
                      <span v-if="getToolCallPreview(tc)" class="tool-preview">{{ getToolCallPreview(tc) }}</span>
                      <span v-if="getToolWriteAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getToolWriteAdded(tc) }}</span>
                      <span v-if="getToolEditAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getToolEditAdded(tc) }}</span>
                      <span v-if="getToolEditRemoved(tc) > 0" class="tool-diff tool-diff-removed">-{{ getToolEditRemoved(tc) }}</span>
                      <span v-if="getToolInlineStatus(tc)" class="tool-status-inline">{{ getToolInlineStatus(tc) }}</span>
                    </div>
                    <div v-if="shouldShowToolOutput(tc)" class="tool-call-output">
                      <pre class="tool-output-block">{{ getToolOutput(tc) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div v-if="agentStream.isStreaming.value" class="message assistant thinking">
            <div class="bubble-wrapper">
              <div v-if="agentStream.currentThinking.value" class="thinking-block active">
                <button class="thinking-toggle" @click="showCurrentThinking = !showCurrentThinking">
                  <Brain :size="14" />
                  <span>{{ t('chat.thinking') }}...</span>
                  <Loader2 :size="12" class="spin" />
                </button>
                <div v-if="showCurrentThinking" class="thinking-content-wrapper">
                  <div class="thinking-content">{{ agentStream.currentThinking.value }}</div>
                </div>
              </div>
              <div v-if="currentStreamingContent && currentStreamingContent.trim()" class="bubble assistant">
                <MarkdownRenderer :content="currentStreamingContent" />
              </div>
              <div v-else-if="pendingToolCallsDisplay.length === 0" class="bubble assistant">
                <div class="bubble-text">...</div>
              </div>
              <div v-if="pendingToolCallsDisplay.length > 0" class="tool-calls-display">
                <div v-for="tc in pendingToolCallsDisplay" :key="tc.id" :class="['tool-call-item', 'running', getToolCallStatus(tc)]">
                  <div class="tool-call-line">
                    <span class="tool-call-marker">
                      <Loader2 v-if="getToolCallStatus(tc) === 'pending' || getToolCallStatus(tc) === 'running'" :size="12" class="spin" />
                      <X v-else-if="getToolCallStatus(tc) === 'error'" :size="12" />
                      <Check v-else :size="12" />
                    </span>
                    <span class="tool-name">{{ tc.name }}</span>
                    <span class="tool-colon">:</span>
                    <span v-if="getToolCallPreview(tc)" class="tool-preview">{{ getToolCallPreview(tc) }}</span>
                    <span v-if="getToolWriteAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getToolWriteAdded(tc) }}</span>
                    <span v-if="getToolEditAdded(tc) > 0" class="tool-diff tool-diff-added">+{{ getToolEditAdded(tc) }}</span>
                    <span v-if="getToolEditRemoved(tc) > 0" class="tool-diff tool-diff-removed">-{{ getToolEditRemoved(tc) }}</span>
                    <span v-if="getToolInlineStatus(tc)" class="tool-status-inline">{{ getToolInlineStatus(tc) }}</span>
                  </div>
                  <div v-if="shouldShowToolOutput(tc)" class="tool-call-output">
                    <pre class="tool-output-block">{{ getToolOutput(tc) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="agentStream.ask.value && agentStream.isStreaming.value" class="message assistant ask-message">
            <div class="bubble-wrapper">
              <div class="ask-inline">
                <div class="ask-inline-header">
                  <div class="ask-inline-title">
                    <HelpCircle :size="16" />
                    <span>{{ agentStream.ask.value.header || t('chat.question') }}</span>
                  </div>
                  <span v-if="agentStream.ask.value.questions.length > 1" class="ask-progress">
                    {{ askStepIndex + 1 }}/{{ agentStream.ask.value.questions.length }}
                  </span>
                </div>
                <div v-if="currentAskQuestion" class="ask-inline-question">{{ currentAskQuestion.question }}</div>
                <div v-if="currentAskQuestion" class="ask-inline-options">
                  <button
                    v-for="(option, index) in currentAskQuestion.options"
                    :key="index"
                    :class="['ask-inline-option', { selected: isAskOptionSelected(option.label) }]"
                    @click="toggleOption(option.label)"
                  >
                    <div class="ask-option-checkbox">
                      <Check v-if="isAskOptionSelected(option.label)" :size="14" />
                    </div>
                    <div class="ask-option-content">
                      <div class="ask-inline-option-label">{{ option.label }}</div>
                      <div class="ask-inline-option-desc">{{ option.description }}</div>
                    </div>
                  </button>
                </div>
                <div class="ask-custom-input">
                  <input
                    v-model="currentAskCustomInput"
                    type="text"
                    :placeholder="t('chat.customInputPlaceholder')"
                    class="ask-input"
                  />
                </div>
                <div class="ask-inline-actions">
                  <button class="btn btn-sm btn-secondary" @click="cancelAsk">{{ t('chat.cancel') }}</button>
                  <button v-if="agentStream.ask.value.questions.length > 1" class="btn btn-sm btn-secondary" :disabled="!canMoveToPreviousAsk" @click="goToPreviousAskStep">
                    <ChevronLeft :size="14" />
                    <span>{{ t('chat.previous') }}</span>
                  </button>
                  <button v-if="agentStream.ask.value.questions.length > 1 && canMoveToNextAsk" class="btn btn-sm btn-secondary" @click="goToNextAskStep">
                    <span>{{ t('chat.next') }}</span>
                    <ChevronRight :size="14" />
                  </button>
                  <button class="btn btn-sm btn-primary" :disabled="!canSubmitAsk" @click="submitAskResponse">
                    {{ t('chat.confirm') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div ref="messagesEndEl" class="messages-end"></div>
        </div>
      </div>

      <div v-if="pendingMessage" class="queued-message">
        <span class="queued-label">{{ t('chat.queuedMessage') }}:</span>
        <span class="queued-content">{{ pendingMessage }}</span>
        <button class="queued-remove" @click="pendingMessage = ''">
          <X :size="14" />
        </button>
      </div>

      <div class="input-area">
        <textarea
          ref="inputEl"
          v-model="input"
          @keydown.enter.exact.prevent="send"
          @input="autoResize"
          :placeholder="agentStream.isStreaming.value ? t('chat.inputPlaceholderQueue') : t('chat.inputPlaceholder')"
          class="input"
          rows="1"
        ></textarea>
        <button v-if="agentStream.isStreaming.value" @click="queueOrStop" class="btn" :class="input.trim() ? 'btn-primary' : 'btn-stop'">
          <SendHorizonal v-if="input.trim()" :size="20" />
          <Square v-else :size="20" />
        </button>
        <button v-else @click="send" :disabled="!input.trim()" class="btn btn-primary">
          <SendHorizonal :size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { SendHorizonal, Loader2, ChevronDown, Check, Plus, Trash2, MessageSquare, Brain, Wrench, Square, ListTodo, CheckCircle2, Circle, HelpCircle, X, Gauge, FileText, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { useAgentsStore } from '@/stores/agents'
import { useConversationStore, type Message as StoreMessage } from '@/stores/conversations'
import { useAgentStream, type Message } from '@/composables/useAgentStream'
import { api } from '@/services/api'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

function transformToStoreMessage(msg: Message): StoreMessage {
  const toolCalls = msg.toolCalls?.map(tc => ({
    id: tc.id,
    function: {
      name: tc.name,
      arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
    }
  }))
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    thinking: msg.thinking,
    toolCallId: msg.toolCallId,
    name: msg.name,
    toolCalls: toolCalls as StoreMessage['toolCalls']
  }
}

function transformMessages(messages: Message[]): StoreMessage[] {
  return messages.map(transformToStoreMessage)
}

function transformFromStoreMessage(msg: StoreMessage): Message {
  const toolCalls = msg.toolCalls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments)
  }))
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    thinking: msg.thinking,
    toolCallId: msg.toolCallId,
    name: msg.name,
    toolCalls: toolCalls as Message['toolCalls']
  }
}

function transformFromStoreMessages(messages: StoreMessage[]): Message[] {
  return messages.map(transformFromStoreMessage)
}

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

interface ToolCallDisplay {
  id: string
  name: string
  arguments: Record<string, unknown>
  status?: 'pending' | 'running' | 'completed' | 'error'
  result?: string
}

const { t } = useI18n()
const agentsStore = useAgentsStore()
const conversationStore = useConversationStore()

const agentStream = useAgentStream()

const selectedAgentId = ref<string | null>(null)
const agentDropdownOpen = ref(false)
const expandedThinking = ref(new Set<string>())
const showCurrentThinking = ref(false)
const toolCallEnabled = ref(true)
const isNewChat = ref(true)

const input = ref('')
const messagesEl = ref<HTMLElement>()
const messagesEndEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()
const isPinnedToBottom = ref(true)
const pendingMessage = ref('')
const showCompression = ref(false)

const askStepIndex = ref(0)
const askAnswers = ref<Array<{ selectedOptions: string[]; customInput: string }>>([])
const todos = ref<TodoItem[]>([])

const sessionThinkingMap = ref(new Map<string, boolean>())

const pendingToolCallsDisplay = computed<ToolCallDisplay[]>(() => {
  return agentStream.pendingToolCalls.value.map(tc => ({
    id: tc.id,
    name: tc.name,
    arguments: tc.arguments,
    status: 'running' as const
  }))
})

const selectedAgentName = computed(() => {
  if (!selectedAgentId.value) return ''
  const agent = agentsStore.agents.find(a => a.id === selectedAgentId.value)
  return agent?.name || ''
})

const selectedAgent = computed(() => {
  return agentsStore.agents.find(agent => agent.id === selectedAgentId.value) || null
})

const displayMessages = computed(() => {
  return agentStream.messages.value.filter(m => {
    if (m.role === 'tool') return false
    if (m.role === 'compressed') return true
    const hasContent = m.content && m.content.trim().length > 0
    const hasToolCalls = m.toolCalls && m.toolCalls.length > 0
    const hasThinking = !!m.thinking
    return hasContent || hasToolCalls || hasThinking
  })
})

const currentStreamingContent = computed(() => {
  return agentStream.streamingContent.value
})

function isSessionThinking(sessionId: string): boolean {
  return sessionThinkingMap.value.get(sessionId) || false
}

const currentAskQuestion = computed(() => {
  const ask = agentStream.ask.value
  if (!ask) {
    return null
  }
  return ask.questions[askStepIndex.value] || null
})

const displayTodos = computed(() => {
  const sorted = [...todos.value].sort((a, b) => {
    if (a.status === 'in_progress' && b.status === 'pending') return -1
    if (a.status === 'pending' && b.status === 'in_progress') return 1
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (a.status !== 'completed' && b.status === 'completed') return -1
    return 0
  })
  return sorted.slice(0, 8)
})

watch(() => agentStream.isStreaming.value, async (streaming) => {
  const sessionId = conversationStore.currentConversation?.id || 'default'
  sessionThinkingMap.value.set(sessionId, streaming)
  if (!streaming) {
    fetchTodos()
    const convId = conversationStore.currentConversation?.id
    if (convId && agentStream.messages.value.length > 0) {
      await conversationStore.saveMessages(convId, transformMessages(agentStream.messages.value))
    }
  }
}, { immediate: true })

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const convId = conversationStore.currentConversation?.id
    if (convId && agentStream.messages.value.length > 0) {
      await conversationStore.saveMessages(convId, transformMessages(agentStream.messages.value))
    }
  }, 1000)
}

watch(() => agentStream.messages.value, () => {
  scrollToBottom()
  debouncedSave()
}, { deep: true })

function toggleThinking(msgId: string) {
  if (expandedThinking.value.has(msgId)) {
    expandedThinking.value.delete(msgId)
  } else {
    expandedThinking.value.add(msgId)
  }
}

function selectAgent(id: string) {
  selectedAgentId.value = id
  agentDropdownOpen.value = false
}

async function selectConversation(id: string) {
  await conversationStore.loadConversation(id)
  isNewChat.value = false
  isPinnedToBottom.value = true
  askStepIndex.value = 0
  askAnswers.value = []
  agentStream.reset()
  if (conversationStore.currentConversation?.messages) {
    agentStream.messages.value = transformFromStoreMessages(conversationStore.currentConversation.messages)
  }
  await fetchTodos()
  scrollToBottom(true)
}

function clearCurrentChat() {
  conversationStore.clearCurrentConversation()
  isNewChat.value = true
  isPinnedToBottom.value = true
  askStepIndex.value = 0
  askAnswers.value = []
  agentStream.reset()
}

async function deleteConversation(id: string) {
  await conversationStore.deleteConversation(id)
  if (conversationStore.currentConversation?.id === id) {
    clearCurrentChat()
  }
}

function getCurrentAskAnswerState() {
  if (!askAnswers.value[askStepIndex.value]) {
    askAnswers.value[askStepIndex.value] = {
      selectedOptions: [],
      customInput: ''
    }
  }
  return askAnswers.value[askStepIndex.value]
}

function isAskOptionSelected(label: string) {
  return getCurrentAskAnswerState().selectedOptions.includes(label)
}

const currentAskCustomInput = computed({
  get() {
    return getCurrentAskAnswerState().customInput
  },
  set(value: string) {
    getCurrentAskAnswerState().customInput = value
  }
})

const canMoveToPreviousAsk = computed(() => askStepIndex.value > 0)

const canMoveToNextAsk = computed(() => {
  const ask = agentStream.ask.value
  return !!ask && askStepIndex.value < ask.questions.length - 1
})

const canSubmitAsk = computed(() => {
  const ask = agentStream.ask.value
  if (!ask) {
    return false
  }
  return ask.questions.every((_, index) => {
    const state = askAnswers.value[index]
    return state && (state.selectedOptions.length > 0 || state.customInput.trim().length > 0)
  })
})

function goToPreviousAskStep() {
  if (canMoveToPreviousAsk.value) {
    askStepIndex.value -= 1
  }
}

function goToNextAskStep() {
  if (canMoveToNextAsk.value) {
    askStepIndex.value += 1
  }
}

async function fetchTodos() {
  try {
    const sessionId = conversationStore.currentConversation?.id
    if (sessionId) {
      const response = await api.getTodos(sessionId)
      todos.value = response.todos || []
    }
  } catch (e) {
    console.error('Failed to fetch todos:', e)
  }
}

function toggleOption(label: string) {
  const question = currentAskQuestion.value
  if (!question) return

  const answerState = getCurrentAskAnswerState()

  if (question.multiSelect) {
    const index = answerState.selectedOptions.indexOf(label)
    if (index > -1) {
      answerState.selectedOptions.splice(index, 1)
    } else {
      answerState.selectedOptions.push(label)
    }
  } else {
    answerState.selectedOptions = answerState.selectedOptions[0] === label && answerState.selectedOptions.length === 1
      ? []
      : [label]
  }
}

async function submitAskResponse() {
  const ask = agentStream.ask.value
  if (!ask) return

  try {
    if (ask.questions.length > 1) {
      const answer = {
        type: 'multi_step' as const,
        value: ask.questions.map((question, index) => {
          const state = askAnswers.value[index]
          const customInputValue = state?.customInput.trim() || ''

          if (customInputValue) {
            return {
              question: question.question,
              answerType: 'custom' as const,
              answer: customInputValue
            }
          }

          return {
            question: question.question,
            answerType: question.multiSelect ? 'multi' as const : 'single' as const,
            answer: question.multiSelect ? [...(state?.selectedOptions || [])] : (state?.selectedOptions[0] || '')
          }
        })
      }

      await agentStream.submitAskResponse(answer)
    } else {
      const question = ask.questions[0]
      const state = askAnswers.value[0]
      const customInputValue = state?.customInput.trim() || ''

      if (customInputValue) {
        await agentStream.submitAskResponse({
          type: 'custom',
          value: customInputValue
        })
      } else if (question.multiSelect) {
        await agentStream.submitAskResponse({
          type: 'multi',
          value: [...(state?.selectedOptions || [])]
        })
      } else {
        await agentStream.submitAskResponse({
          type: 'single',
          value: state?.selectedOptions[0] || ''
        })
      }
    }

    askStepIndex.value = 0
    askAnswers.value = []
    scrollToBottom(true)
  }
  catch (e) {
    console.error('Failed to submit ask response:', e)
  }
}

async function cancelAsk() {
  const ask = agentStream.ask.value
  if (!ask) return

  try {
    await agentStream.submitAskResponse({
      type: 'custom',
      value: ''
    })
    askStepIndex.value = 0
    askAnswers.value = []
  } catch (e) {
    console.error('Failed to cancel ask:', e)
  }
}

onMounted(async () => {
  await agentsStore.init()
  await conversationStore.loadConversations()
  selectedAgentId.value = agentsStore.activeAgentId
  await fetchTodos()
})

onBeforeUnmount(() => {
  agentStream.stopSession()
})

async function send() {
  if (!input.value.trim() || agentStream.isStreaming.value) return

  if (!selectedAgent.value || !selectedAgent.value.modelId) {
    return
  }

  const userContent = input.value.trim()
  const title = userContent.substring(0, 20)

  if (isNewChat.value) {
    await conversationStore.createConversation(title, selectedAgent.value.id)
    isNewChat.value = false
  }

  const userMessage: Message = {
    id: Math.random().toString(36).substring(2),
    role: 'user',
    content: userContent,
    timestamp: Date.now()
  }

  agentStream.messages.value = [...agentStream.messages.value, userMessage]
  scrollToBottom(true)

  input.value = ''
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
    inputEl.value.style.overflowY = 'hidden'
  }

  const sessionId = conversationStore.currentConversation?.id

  agentStream.startSession(selectedAgent.value.id, userContent, {
    sessionId,
    modelId: selectedAgent.value.modelId,
    enableTools: toolCallEnabled.value
  })
}

async function stopGeneration() {
  agentStream.stopSession()
  pendingMessage.value = ''
  scrollToBottom(true)
}

async function queueOrStop() {
  if (input.value.trim()) {
    pendingMessage.value = input.value.trim()
    input.value = ''
    if (inputEl.value) {
      inputEl.value.style.height = 'auto'
      inputEl.value.style.overflowY = 'hidden'
    }
  } else {
    await stopGeneration()
  }
}

function scrollToBottom(force = false) {
  if (!force && !isPinnedToBottom.value) return

  nextTick(() => {
    requestAnimationFrame(() => {
      messagesEndEl.value?.scrollIntoView({
        block: 'end',
        behavior: force ? 'auto' : 'smooth'
      })
    })
  })
}

function handleScroll() {
  if (!messagesEl.value) return
  
  const { scrollTop, scrollHeight, clientHeight } = messagesEl.value
  isPinnedToBottom.value = scrollHeight - scrollTop - clientHeight < 32
}

function autoResize() {
  if (!inputEl.value) return
  
  inputEl.value.style.height = 'auto'
  const lineHeight = parseInt(getComputedStyle(inputEl.value).lineHeight) || 20
  const maxHeight = lineHeight * 5
  
  if (inputEl.value.scrollHeight > maxHeight) {
    inputEl.value.style.height = `${maxHeight}px`
    inputEl.value.style.overflowY = 'auto'
  } else {
    inputEl.value.style.height = `${inputEl.value.scrollHeight}px`
    inputEl.value.style.overflowY = 'hidden'
  }
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function formatDate(ts: number) {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return date.toLocaleTimeString()
  if (days === 1) return t('chat.yesterday')
  if (days < 7) return t('chat.daysAgo', { count: String(days) })
  return date.toLocaleDateString()
}

function getToolArgumentString(args: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function shortenToolText(text: string, maxLength = 96) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function countToolLines(value: string) {
  if (!value) return 0
  return value.split(/\r?\n/).length
}

function getToolCallPreview(toolCall: ToolCallDisplay) {
  const args = toolCall.arguments
  const searchPreview = getToolArgumentString(args, ['query', 'q'])

  if (searchPreview && (
    toolCall.name.includes('search')
    || toolCall.name.includes('query')
    || toolCall.name.includes('browser')
  )) {
    return shortenToolText(searchPreview)
  }

  switch (toolCall.name) {
    case 'bash':
      return shortenToolText(getToolArgumentString(args, ['command']))
    case 'read':
    case 'write':
    case 'edit':
      return shortenToolText(
        getToolArgumentString(args, ['filePath', 'path'])
      )
    case 'grep':
    case 'glob': {
      const pattern = getToolArgumentString(args, ['pattern'])
      const path = getToolArgumentString(args, ['path', 'filePath'])
      return shortenToolText([pattern, path].filter(Boolean).join(' '))
    }
    case 'ls':
      return shortenToolText(getToolArgumentString(args, ['path']) || '.')
    case 'ask': {
      const singleQuestion = getToolArgumentString(args, ['question'])
      if (singleQuestion) {
        return shortenToolText(singleQuestion)
      }

      const questionsValue = args.questions
      if (Array.isArray(questionsValue)) {
        const questions = questionsValue
          .map(item => {
            if (typeof item === 'string') {
              return item
            }
            if (item && typeof item === 'object') {
              const record = item as Record<string, unknown>
              if (typeof record.question === 'string') {
                return record.question
              }
            }
            return ''
          })
          .filter(Boolean)

        if (questions.length > 0) {
          return shortenToolText(questions.join(' | '))
        }
      }

      return shortenToolText(getToolArgumentString(args, ['header']))
    }
    default:
      return shortenToolText(
        searchPreview ||
        getToolArgumentString(args, ['command', 'filePath', 'path', 'pattern', 'question'])
      )
  }
}

function getToolEditAdded(toolCall: ToolCallDisplay) {
  if (toolCall.name !== 'edit') return 0
  const newString = getToolArgumentString(toolCall.arguments, ['newString'])
  return countToolLines(newString)
}

function getToolEditRemoved(toolCall: ToolCallDisplay) {
  if (toolCall.name !== 'edit') return 0
  const oldString = getToolArgumentString(toolCall.arguments, ['oldString'])
  return countToolLines(oldString)
}

function getToolWriteAdded(toolCall: ToolCallDisplay) {
  if (toolCall.name !== 'write') return 0
  const content = getToolArgumentString(toolCall.arguments, ['content'])
  return countToolLines(content)
}

function getToolStatusText(status: string) {
  switch (status) {
    case 'pending': return t('chat.toolPending')
    case 'running': return t('chat.toolRunning')
    case 'completed': return t('chat.toolCompleted')
    case 'error': return t('chat.toolError')
    default: return status
  }
}

function getToolCallStatus(toolCall: ToolCallDisplay) {
  return toolCall.status || 'pending'
}

function getToolInlineStatus(toolCall: ToolCallDisplay) {
  const status = getToolCallStatus(toolCall)
  if (status === 'pending' || status === 'running' || status === 'error') {
    return getToolStatusText(status)
  }
  return ''
}

function getToolOutput(toolCall: ToolCallDisplay) {
  return toolCall.result?.trim() || t('common.noData')
}

function shouldShowToolOutput(toolCall: ToolCallDisplay) {
  if (!toolCall.result?.trim()) {
    return false
  }
  if (toolCall.name === 'bash') {
    return true
  }
  if (toolCall.name === 'ask' && toolCall.status === 'error') {
    return true
  }
  return toolCall.status === 'error' && toolCall.name !== 'ask'
}
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.conversations-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-header h3 {
  font-size: 1rem;
  margin: 0;
}

.conversation-list-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.conversation-list {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  scrollbar-gutter: stable;
}

.conversation-list::-webkit-scrollbar {
  width: 6px;
}

.conversation-list::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

.conversation-list::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

.conversation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.conversation-item:hover {
  background: var(--bg-hover);
}

.conversation-item.active {
  background: var(--accent-primary);
  color: white;
}

.conversation-item.active .conv-meta {
  color: rgba(255, 255, 255, 0.7);
}

.conv-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.conv-title {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.conv-delete {
  opacity: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.conversation-item:hover .conv-delete {
  opacity: 1;
}

.conv-delete:hover {
  background: rgba(255, 255, 255, 0.1);
}

.empty-conversations {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-muted);
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

.tool-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
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

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.toggle-switch {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
}

.toggle-switch:hover {
  border-color: var(--border-color-hover);
}

.toggle-switch.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all var(--transition-fast);
}

.toggle-switch.active .toggle-thumb {
  left: 18px;
  background: white;
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

.messages-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.messages {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-gutter: stable;
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

.messages-end {
  width: 100%;
  height: 1px;
  flex-shrink: 0;
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

.empty-icon {
  width: 80px;
  height: 80px;
  opacity: 0.5;
}

.tool-calls-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 8px;
  width: 100%;
}

.tool-call-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
  max-width: 100%;
}

.tool-call-item.error {
  color: var(--text-secondary);
}

.tool-call-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.tool-call-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-name {
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.tool-colon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-preview {
  min-width: 0;
  max-width: 100%;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-diff {
  font-family: var(--font-mono), monospace;
  font-size: 0.72rem;
  flex-shrink: 0;
}

.tool-diff-added {
  color: var(--status-success);
}

.tool-diff-removed {
  color: var(--status-error);
}

.tool-status-inline {
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-call-output {
  width: min(100%, 720px);
  margin-left: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.tool-output-block {
  margin: 0;
  padding: 10px 12px;
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.45;
  max-height: calc(1.45em * 5 + 20px);
  overflow-y: auto;
}

.message {
  display: flex;
  max-width: 80%;
}

.message.user {
  margin-left: auto;
}

.message.assistant {
  margin-right: auto;
}

.message.error {
  margin-right: auto;
}

.message.compressed {
  margin-right: auto;
  max-width: 100%;
}

.compressed-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  width: 100%;
  transition: all var(--transition-fast);
}

.compressed-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.compressed-toggle .chevron {
  margin-left: auto;
  transition: transform var(--transition-fast);
}

.compressed-toggle .chevron.rotated {
  transform: rotate(180deg);
}

.compressed-content-wrapper {
  max-height: 300px;
  overflow: hidden;
  margin-top: 8px;
}

.compressed-content {
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: pre-wrap;
  line-height: 1.5;
  max-height: 300px;
  overflow-y: auto;
}

.bubble-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}

.message.user .bubble-wrapper {
  align-items: flex-end;
}

.message.assistant .bubble-wrapper {
  align-items: flex-start;
}

.message.error .bubble-wrapper {
  align-items: flex-start;
}

.thinking-block {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  overflow: hidden;
  max-width: 100%;
}

.thinking-block.active {
  border-color: var(--accent-primary);
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
}

.thinking-toggle:hover {
  background: var(--bg-hover);
}

.thinking-toggle .chevron {
  margin-left: auto;
  transition: transform var(--transition-fast);
}

.thinking-toggle .chevron.rotated {
  transform: rotate(180deg);
}

.thinking-content-wrapper {
  max-height: 300px;
  overflow: hidden;
  position: relative;
}

.thinking-content {
  padding: 12px;
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: pre-wrap;
  line-height: 1.5;
  border-top: 1px solid var(--border-color);
  max-height: 300px;
  overflow-y: auto;
}

.thinking-content::-webkit-scrollbar {
  width: 4px;
}

.thinking-content::-webkit-scrollbar-track {
  background: transparent;
}

.thinking-content::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 2px;
}

.bubble {
  padding: 12px 16px;
  border-radius: 20px;
  max-width: 100%;
  word-wrap: break-word;
}

.bubble.user {
  background: var(--chat-user-bubble-bg);
  color: var(--chat-user-bubble-text);
  border-bottom-right-radius: 6px;
}

.bubble.user,
.bubble.user :deep(p),
.bubble.user :deep(span) {
  color: var(--chat-user-bubble-text) !important;
}

.bubble.assistant {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 6px;
}

.bubble.error {
  background: var(--status-error);
  color: white;
  border-bottom-left-radius: 6px;
}

.bubble-text {
  white-space: pre-wrap;
  line-height: 1.5;
  word-wrap: break-word;
}

.bubble-time {
  font-size: 0.65rem;
  color: var(--text-muted);
  padding: 0 4px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.todos-panel {
  border-top: 1px solid var(--border-color);
  background: var(--bg-elevated);
  max-height: 200px;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-todos {
  border-top: 1px solid var(--border-color);
  background: var(--bg-elevated);
  max-height: 180px;
  overflow-y: auto;
  flex-shrink: 0;
}

.todos-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.todos-list {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
}

.todo-item.completed {
  opacity: 0.6;
}

.todo-item.completed .todo-content {
  text-decoration: line-through;
}

.todo-item.in_progress {
  background: var(--accent-primary-bg);
}

.todo-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.todo-status-icon .completed {
  color: var(--status-success);
}

.todo-status-icon .in_progress {
  color: var(--accent-primary);
}

.todo-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-priority {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
}

.todo-priority.high {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.todo-priority.medium {
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
}

.todo-priority.low {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  align-items: flex-end;
}

.input-area .input {
  flex: 1;
  resize: none;
  min-height: 44px;
  max-height: calc(1.5em * 5 + 16px);
  line-height: 1.5;
  padding: 10px 14px;
  font-family: inherit;
  font-size: inherit;
  overflow-y: hidden;
}

.input-area .input:focus {
  outline: none;
}

.input-area .btn {
  padding: 12px 20px;
  flex-shrink: 0;
}

.btn-stop {
  background: var(--status-error);
  border: none;
  color: white;
}

.btn-stop:hover {
  background: #dc2626;
  transform: scale(1.05);
}

.queued-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--accent-primary-bg);
  border-top: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.queued-label {
  color: var(--text-muted);
  flex-shrink: 0;
}

.queued-content {
  flex: 1;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-remove {
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.queued-remove:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ask-message {
  max-width: 100%;
  width: 100%;
}

.ask-message .bubble-wrapper {
  width: 100%;
}

.ask-inline {
  width: min(100%, 840px);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
}

.ask-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent-primary);
  margin-bottom: 12px;
}

.ask-inline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ask-progress {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--badge-muted-bg);
  color: var(--text-secondary);
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.ask-inline-question {
  font-size: 0.95rem;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 16px;
}

.ask-inline-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.ask-inline-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.ask-inline-option:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.ask-inline-option.selected {
  background: var(--accent-primary-bg);
  border-color: var(--accent-primary);
}

.ask-option-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all var(--transition-fast);
}

.ask-inline-option.selected .ask-option-checkbox {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.ask-option-content {
  flex: 1;
  min-width: 0;
}

.ask-inline-option-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.ask-inline-option-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.ask-custom-input {
  margin-top: 12px;
  margin-bottom: 16px;
}

.ask-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.ask-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.ask-input::placeholder {
  color: var(--text-muted);
}

.ask-inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .ask-inline {
    width: 100%;
  }

  .ask-inline-options {
    grid-template-columns: 1fr;
  }
}
</style>
