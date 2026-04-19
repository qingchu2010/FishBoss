<template>
  <div :class="['message', msg.role]">
    <div class="bubble-wrapper">
      <div v-if="msg.role === 'assistant' && msg.thinking" class="thinking-block">
        <button class="thinking-toggle" @click="toggleThinking">
          <Brain :size="14" />
          <span>{{ t('chat.thinking') }}</span>
          <ChevronDown :size="14" :class="{ rotated: isThinkingExpanded }" />
        </button>
        <div v-if="isThinkingExpanded" class="thinking-content-wrapper">
          <div class="thinking-content">{{ msg.thinking }}</div>
        </div>
      </div>
      <div v-if="msg.content && msg.content.trim()" :class="['bubble', msg.role]">
        <MarkdownRenderer v-if="msg.role !== 'error'" :content="msg.content" />
        <div v-else class="bubble-text">{{ msg.content }}</div>
      </div>
      <div v-if="msg.content && msg.content.trim() && msg.role !== 'error'" class="bubble-time">{{ formatTime(msg.timestamp) }}</div>
      <ToolCallsDisplay v-if="msg.toolCalls && msg.toolCalls.length > 0" :tool-calls="msg.toolCalls" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Brain, ChevronDown } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ToolCallsDisplay from './ToolCallsDisplay.vue'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'compressed'
  content: string
  timestamp: number
  thinking?: string
  toolCalls?: Array<{
    id: string
    function: { name: string; arguments: string }
    status?: 'pending' | 'running' | 'completed' | 'error'
    result?: string
  }>
}

const props = defineProps<{
  msg: Message
  expandedThinking: Set<string>
}>()

const emit = defineEmits<{
  'toggle-thinking': [id: string]
}>()

const { t } = useI18n()
const isThinkingExpanded = ref(props.expandedThinking.has(props.msg.id))

function toggleThinking() {
  isThinkingExpanded.value = !isThinkingExpanded.value
  emit('toggle-thinking', props.msg.id)
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}
</script>

<style scoped>
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

.bubble-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}

.message.user .bubble-wrapper {
  align-items: flex-end;
}

.message.assistant .bubble-wrapper,
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
</style>
