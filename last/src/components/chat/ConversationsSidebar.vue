<template>
  <div class="conversations-sidebar">
    <div class="sidebar-header">
      <h3>{{ t('chat.conversations') }}</h3>
      <button class="btn btn-sm btn-secondary" @click="$emit('clear')">
        <Plus :size="16" />
      </button>
    </div>
    <div class="conversation-list-wrapper">
      <div class="conversation-list" ref="listEl">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conversation-item', { active: currentId === conv.id }]"
          @click="$emit('select', conv.id)"
        >
          <div class="conv-info">
            <span class="conv-title">{{ conv.title }}</span>
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
    <div v-if="todos.length > 0" class="sidebar-todos">
      <div class="todos-header">
        <ListTodo :size="14" />
        <span>{{ t('chat.taskList') }}</span>
      </div>
      <div class="todos-list">
        <div v-for="todo in todos" :key="todo.id" :class="['todo-item', todo.status]">
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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Trash2, MessageSquare, ListTodo, CheckCircle2, Loader2, Circle } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

interface ConversationMeta {
  id: string
  title: string
  updatedAt: number
}

interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

defineProps<{
  conversations: ConversationMeta[]
  currentId: string | null
  todos: Todo[]
}>()

defineEmits<{
  clear: []
  select: [id: string]
  delete: [id: string]
}>()

const { t } = useI18n()
const listEl = ref<HTMLElement>()

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
</script>

<style scoped>
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

.todo-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
