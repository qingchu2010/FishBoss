<template>
  <div class="conversations-sidebar">
    <div class="sidebar-header">
      <h3>{{ t('chat.conversations') }}</h3>
      <button class="btn btn-sm btn-secondary" @click="$emit('clear')">
        <Plus :size="16" />
      </button>
    </div>
    <div class="conversation-list-wrapper">
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conversation-item', { active: currentId === conv.id }]"
          @click="$emit('select', conv.id)"
        >
          <div class="conv-info">
            <div class="conv-title-row">
              <span class="conv-title">{{ conv.title }}</span>
              <span v-if="conv.isRunning" class="conv-running">{{ t('chat.toolRunning') }}</span>
            </div>
            <span class="conv-meta">{{ formatDate(conv.updatedAt) }}</span>
          </div>
          <button class="conv-delete" @click.stop="$emit('delete', conv.id)">
            <Trash2 :size="14" />
          </button>
        </div>
        <div v-if="conversations.length === 0" class="empty-conversations">
          <MessageSquare :size="32" />
          <p>{{ t('chat.noConversations') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Trash2, MessageSquare } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

interface ConversationMeta {
  id: string
  title: string
  updatedAt: string
  isRunning?: boolean
}

defineProps<{
  conversations: ConversationMeta[]
  currentId: string | null
}>()

defineEmits<{
  clear: []
  select: [id: string]
  delete: [id: string]
}>()

const { t } = useI18n()

function formatDate(ts: string) {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return date.toLocaleTimeString()
  if (days === 1) return t('chat.yesterday')
  if (days < 7) return t('chat.daysAgo', { count: String(days) })
  return date.toLocaleDateString()
}
</script>

<style scoped>
.conversations-sidebar {
  width: 280px;
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
}

.conversation-list-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.conversation-list {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.conversation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
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
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.conv-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.conv-title {
  font-size: 0.9rem;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-running {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 96px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  color: var(--accent-primary);
  font-size: 0.65rem;
  line-height: 1;
}

.conv-running::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1s ease-in-out infinite;
}

.conversation-item.active .conv-running {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
  color: white;
}

.conv-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.conv-delete {
  flex-shrink: 0;
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

.empty-conversations {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-muted);
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.45;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
