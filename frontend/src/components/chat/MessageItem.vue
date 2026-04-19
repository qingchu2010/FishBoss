<template>
  <div :class="['message', msg.role]">
    <div class="bubble-wrapper">
      <div v-if="msg.role === 'assistant' && msg.metadata?.thinking" class="thinking-block">
        <button class="thinking-toggle" @click="isThinkingExpanded = !isThinkingExpanded">
          <Brain :size="14" />
          <span>{{ t('chat.thinking') }}</span>
          <ChevronDown :size="14" :class="['thinking-chevron', { rotated: isThinkingExpanded }]" />
        </button>
        <div :class="['thinking-content-wrapper', { collapsed: !isThinkingExpanded }]">
          <div class="thinking-content">{{ msg.displayThinking ?? msg.metadata?.thinking }}</div>
        </div>
      </div>

      <div v-if="displayContent && displayContent.trim()" :class="['bubble', msg.role]">
        <MarkdownRenderer v-if="msg.role !== 'error'" :content="displayContent" />
        <div v-else class="bubble-text">{{ displayContent }}</div>
      </div>
      <div v-if="displayContent && displayContent.trim() && msg.role !== 'error'" class="bubble-time">{{ formatTime(msg.createdAt) }}</div>
      <ToolCallsDisplay v-if="msg.toolCalls && msg.toolCalls.length > 0" :tool-calls="msg.toolCalls ?? []" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Brain, ChevronDown } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ToolCallsDisplay from './ToolCallsDisplay.vue'
import type { ConversationMessage } from '@/services/conversations'

const props = defineProps<{
  msg: ConversationMessage
}>()

const { t } = useI18n()
const thinkingContent = computed(() => {
  const displayThinking = props.msg.displayThinking
  if (typeof displayThinking === 'string') {
    return displayThinking
  }
  const metadata = props.msg.metadata
  if (!metadata || typeof metadata !== 'object' || !('thinking' in metadata)) {
    return ''
  }
  return typeof metadata.thinking === 'string' ? metadata.thinking : ''
})
const displayContent = computed(() => props.msg.displayContent ?? props.msg.content)
const hasAnswerContent = computed(() => Boolean(displayContent.value.trim()))
const isThinkingExpanded = ref(Boolean(thinkingContent.value && !hasAnswerContent.value))
const hasAutoCollapsed = ref(hasAnswerContent.value)

watch(thinkingContent, (value) => {
  if (value && !hasAnswerContent.value) {
    isThinkingExpanded.value = true
    hasAutoCollapsed.value = false
  }
})

watch(hasAnswerContent, (value) => {
  if (!thinkingContent.value) {
    return
  }

  if (!value) {
    isThinkingExpanded.value = true
    hasAutoCollapsed.value = false
    return
  }

  if (!hasAutoCollapsed.value) {
    isThinkingExpanded.value = false
    hasAutoCollapsed.value = true
  }
})

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString()
}
</script>

<style scoped>
.message {
  display: flex;
  width: 100%;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant,
.message.system,
.message.tool {
  justify-content: flex-start;
}

.message.error {
  justify-content: flex-start;
}

.bubble-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 100%;
}

.message.user .bubble-wrapper {
  align-items: flex-end;
  width: auto;
  max-width: min(80%, 42rem);
}

.message.assistant .bubble-wrapper,
.message.system .bubble-wrapper,
.message.tool .bubble-wrapper,
.message.error .bubble-wrapper {
  align-items: stretch;
  width: min(80%, 46rem);
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

.thinking-chevron {
  margin-left: auto;
  transition: transform var(--transition-fast);
}

.thinking-chevron.rotated {
  transform: rotate(180deg);
}

.thinking-content-wrapper {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition: grid-template-rows 220ms ease, opacity 220ms ease;
  overflow: hidden;
}

.thinking-content-wrapper.collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}

.thinking-content-wrapper.collapsed .thinking-content {
  padding-top: 0;
  padding-bottom: 0;
  border-top-width: 0;
}

.thinking-content {
  min-height: 0;
  padding: 12px;
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: pre-wrap;
  line-height: 1.5;
  border-top: 1px solid var(--border-color);
  max-height: 300px;
  overflow-y: auto;
  transition: padding 220ms ease, border-top-width 220ms ease;
}

.bubble {
  padding: 12px 16px;
  border-radius: 20px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
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

.bubble.assistant,
.bubble.system,
.bubble.tool {
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

@media (max-width: 768px) {
  .message.user .bubble-wrapper,
  .message.assistant .bubble-wrapper,
  .message.system .bubble-wrapper,
  .message.tool .bubble-wrapper,
  .message.error .bubble-wrapper {
    width: 100%;
    max-width: 100%;
  }
}
</style>
