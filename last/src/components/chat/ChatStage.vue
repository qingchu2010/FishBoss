<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/i18n'

const chatStore = useChatStore()
const {
  messages,
  conversations,
  activeConversationId,
  isLoading,
  isStreaming
} = storeToRefs(chatStore)
const { t } = useI18n()

const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const canSend = computed(() => {
  return messageInput.value.trim() && !isLoading.value && !isStreaming.value
})

const activeConversation = computed(() => {
  return conversations.value.find(c => c.id === activeConversationId.value)
})

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const sendMessage = async () => {
  if (!canSend.value) return
  const content = messageInput.value.trim()
  messageInput.value = ''
  chatStore.sendMessage(content)
  await nextTick()
  scrollToBottom()
}

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
  } catch (e) {
    console.error('Failed to copy message:', e)
  }
}

const reuseMessage = (content: string) => {
  messageInput.value = content
}

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '--:--'
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

watch(() => messages.value.length, () => {
  scrollToBottom()
})

const setInput = (content: string) => {
  messageInput.value = content
}

defineExpose({
  scrollToBottom,
  setInput
})
</script>

<template>
  <main class="chat-stage chat-panel-card">
    <div class="stage-header">
      <div class="chat-title-block">
        <div class="section-kicker">{{ t('chat.sessionActive') }}</div>
        <h2>{{ activeConversation?.title || t('chat.noSession') }}</h2>
        <p class="stage-subtitle">
          {{ activeConversation ? t('page.chat.subtitle') : t('chat.noSessionHint') }}
        </p>
      </div>
      <div class="stage-controls">
        <div class="connection-badge" :class="{ connected: true }">
          <span class="dot"></span>
          {{ t('header.connected') }}
        </div>
      </div>
    </div>

    <div class="messages-container" ref="messagesContainer">
      <div v-if="!activeConversationId" class="no-conversation">
        <div class="welcome-content">
          <span class="welcome-icon">FB</span>
          <h2>{{ t('chat.welcome') }}</h2>
          <p>{{ t('chat.welcomeHint') }}</p>
        </div>
      </div>

      <div v-else class="messages-list">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="[message.role, { streaming: message.id === 'streaming' && isStreaming }]"
        >
          <div class="message-avatar">
            {{ message.role === 'user' ? t('chat.user') : t('chat.ai') }}
          </div>
          <div class="message-content">
            <div class="message-text" style="white-space: pre-wrap">{{ message.content }}</div>
            <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            <div class="message-tools" v-if="message.id !== 'streaming'">
              <button type="button" class="tool-btn" @click="copyMessage(message.content)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                {{ t('chat.copy') }}
              </button>
              <button type="button" class="tool-btn" @click="reuseMessage(message.content)">{{ t('chat.reuse') }}</button>
            </div>
          </div>
        </div>

        <div v-if="isStreaming" class="message assistant streaming">
          <div class="message-avatar">{{ t('chat.ai') }}</div>
          <div class="message-content">
            <div class="message-text">
              <span class="typing-indicator">
                <span></span><span></span><span></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <textarea
          v-model="messageInput"
          class="message-input"
          :placeholder="t('chat.inputPlaceholder')"
          rows="1"
          @keydown="handleKeyDown"
          :disabled="!activeConversationId"
        ></textarea>
        <button
          type="button"
          class="send-btn"
          :class="{ active: canSend }"
          @click="sendMessage"
          :disabled="!canSend"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
          </svg>
        </button>
      </div>
      <p class="input-hint">{{ t('chat.inputHint') }}</p>
    </div>
  </main>
</template>

<style scoped>
.chat-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  padding: 20px;
}

.stage-header {
  padding: 0 0 16px;
  border-bottom: 1px solid var(--shell-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.chat-title-block {
  flex: 1;
  min-width: 200px;
}

.chat-title-block h2 {
  font-size: 1.25rem;
  margin-top: 4px;
}

.stage-subtitle {
  margin-top: 6px;
  font-size: 0.85rem;
  max-width: 400px;
}

.stage-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.section-kicker {
  color: var(--accent-secondary);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
}

.no-conversation {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-content {
  text-align: center;
  max-width: 400px;
}

.welcome-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 24px;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-content h2 {
  margin-bottom: 12px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.message {
  display: flex;
  gap: 14px;
  max-width: 80%;
  animation: message-enter 0.2s ease;
}

.message.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message.user .message-content {
  align-items: flex-end;
}

.message.user .message-text {
  background: var(--accent-gradient);
  color: white;
  border-radius: 20px 20px 4px 20px;
}

.message.assistant .message-text {
  background: var(--bg-card);
  border-radius: 20px 20px 20px 4px;
}

@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 500;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-text {
  padding: 12px 16px;
  font-size: 0.95rem;
  line-height: 1.6;
  word-break: break-word;
}

.message-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  padding: 0 4px;
}

.message-tools {
  display: flex;
  gap: 6px;
  padding: 0 4px;
  opacity: 0.7;
  transition: opacity var(--transition-fast);
}

.message-tools:hover {
  opacity: 1;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tool-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-color-hover);
}

.typing-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.input-area {
  padding: 16px 0 0;
  border-top: 1px solid var(--shell-border);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 8px 8px 8px 20px;
  transition: all var(--transition-fast);
}

.input-wrapper:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}

.message-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.95rem;
  resize: none;
  max-height: 120px;
  padding: 8px 0;
  line-height: 1.5;
}

.message-input::placeholder {
  color: var(--text-muted);
}

.message-input:disabled {
  opacity: 0.5;
}

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-hover);
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.send-btn.active {
  background: var(--accent-gradient);
  color: white;
  box-shadow: var(--shadow-sm);
}

.send-btn.active:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-glow);
}

.send-btn:disabled {
  cursor: not-allowed;
}

.input-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 10px;
}

.chat-panel-card {
  background: var(--surface-gradient);
  border: 1px solid var(--shell-border);
  border-radius: 24px;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
}

.connection-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-card);
  border-radius: 20px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.connection-badge .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-disconnected);
  transition: background var(--transition-fast);
}

.connection-badge.connected {
  color: var(--status-connected);
}

.connection-badge.connected .dot {
  background: var(--status-connected);
  box-shadow: 0 0 8px var(--status-connected);
}
</style>
