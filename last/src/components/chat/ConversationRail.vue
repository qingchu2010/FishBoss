<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/i18n'

const chatStore = useChatStore()
const { conversations, activeConversationId } = storeToRefs(chatStore)
const { t } = useI18n()

const searchQuery = ref('')
const showNewChatModal = ref(false)
const newChatTitle = ref('')

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)

const formatDate = (timestamp: string | null) => {
  if (!timestamp) return t('common.noData')
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString()
}

const selectConversation = async (id: string) => {
  await chatStore.selectConversation(id)
}

const deleteConversation = async (e: Event, id: string) => {
  e.stopPropagation()
  if (confirm(t('conversation.deleteConfirm'))) {
    await chatStore.deleteConversation(id)
  }
}

const createNewConversation = () => {
  const title = newChatTitle.value.trim() || `Chat ${new Date().toLocaleString()}`
  chatStore.createConversation(title)
  showNewChatModal.value = false
  newChatTitle.value = ''
}

defineEmits<{
  (e: 'reuse-message', content: string): void
}>()
</script>

<template>
  <aside class="conversation-rail">
    <div class="rail-header chat-panel-card">
      <div class="rail-title-block">
        <div class="section-kicker">{{ t('chat.sessionActive') }}</div>
        <h3>{{ t('conversation.title') }}</h3>
      </div>
      <button type="button" class="btn btn-primary btn-sm" @click="showNewChatModal = true">
        <span>+</span> {{ t('conversation.newChat') }}
      </button>
    </div>

    <div class="conversations-list" v-if="!hasSearchQuery">
      <div v-if="conversations.length === 0" class="empty-state">
        <span class="empty-icon">{{ t('conversation.emptyIcon') }}</span>
        <p>{{ t('conversation.empty') }}</p>
      </div>
      <div
        v-for="conv in conversations"
        :key="conv.id"
        class="conversation-item"
        :class="{ active: conv.id === activeConversationId }"
        @click="selectConversation(conv.id)"
      >
        <div class="conversation-content">
          <span class="conversation-title">{{ conv.title }}</span>
          <span class="conversation-date">{{ formatDate(conv.updated_at) }}</span>
        </div>
        <button type="button" class="delete-btn" @click="(e) => deleteConversation(e, conv.id)">×</button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showNewChatModal" class="modal-overlay" @click.self="showNewChatModal = false">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ t('conversation.newTitle') }}</h2>
            <button type="button" class="btn btn-ghost btn-icon" @click="showNewChatModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>{{ t('conversation.titleLabel') }}</label>
              <input
                v-model="newChatTitle"
                type="text"
                class="input"
                :placeholder="t('conversation.titlePlaceholder')"
                @keydown.enter="createNewConversation"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showNewChatModal = false">{{ t('conversation.cancel') }}</button>
            <button type="button" class="btn btn-primary" @click="createNewConversation">{{ t('conversation.create') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.conversation-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.rail-header {
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.rail-title-block {
  flex: 1;
  min-width: 0;
}

.rail-title-block h3 {
  font-size: 1rem;
  margin-top: 4px;
}

.section-kicker {
  color: var(--accent-secondary);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  margin-bottom: 4px;
}

.conversations-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 12px;
}

.conversation-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: 4px;
}

.conversation-item:hover {
  background: var(--bg-hover);
}

.conversation-item:hover .delete-btn {
  opacity: 1;
}

.conversation-item.active {
  background: var(--bg-active);
}

.conversation-item.active .conversation-title {
  color: var(--accent-primary);
}

.conversation-content {
  flex: 1;
  min-width: 0;
}

.conversation-title {
  display: block;
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.conversation-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.delete-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
  border-radius: 4px;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--status-error);
}

.chat-panel-card {
  background: var(--surface-gradient);
  border: 1px solid var(--shell-border);
  border-radius: 16px;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
}
</style>
