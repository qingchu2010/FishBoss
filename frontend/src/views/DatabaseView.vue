<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Database, RefreshCw, Trash2 } from 'lucide-vue-next'
import { databaseApi, type DatabaseMessage, type DatabaseMessageThread, type DatabaseReference } from '@/services/database'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores'

const { t } = useI18n()
const appStore = useAppStore()
const loading = ref(false)
const deleting = ref(false)
const references = ref<DatabaseReference[]>([])
const threads = ref<DatabaseMessageThread[]>([])
const selectedThreadId = ref<string | null>(null)
const selectedThreadMessages = ref<DatabaseMessage[]>([])
const threadPendingDelete = ref<DatabaseMessageThread | null>(null)

const selectedThread = computed(() =>
  threads.value.find((thread) => thread.id === selectedThreadId.value) ?? null
)

const selectedThreadMessageCount = computed(() => selectedThreadMessages.value.length)

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

async function loadDatabase() {
  loading.value = true
  try {
    const previousSelectedThreadId = selectedThreadId.value
    const [nextReferences, nextThreads] = await Promise.all([
      databaseApi.listReferences(),
      databaseApi.listMessageThreads()
    ])
    references.value = nextReferences
    threads.value = nextThreads
    selectedThreadId.value = nextThreads.some((thread) => thread.id === previousSelectedThreadId)
      ? previousSelectedThreadId
      : nextThreads[0]?.id ?? null
    await loadSelectedThreadMessages()
  } finally {
    loading.value = false
  }
}

async function selectThread(threadId: string) {
  selectedThreadId.value = threadId
  await loadSelectedThreadMessages()
}

async function loadSelectedThreadMessages() {
  if (!selectedThreadId.value) {
    selectedThreadMessages.value = []
    return
  }
  selectedThreadMessages.value = await databaseApi.listMessages(selectedThreadId.value)
}

function formatExternalId(value: string): string {
  if (value.length <= 18) {
    return value
  }
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

function threadEventType(thread: DatabaseMessageThread): string {
  const eventTag = thread.tags?.find((tag) => tag.startsWith('qq-event:'))
  return eventTag?.slice('qq-event:'.length) ?? ''
}

function threadTargetLabel(thread: DatabaseMessageThread): string {
  const eventType = threadEventType(thread)
  if (eventType === 'GROUP_AT_MESSAGE_CREATE') {
    return t('page.database.targetGroup')
  }
  if (eventType === 'AT_MESSAGE_CREATE') {
    return t('page.database.targetGuild')
  }
  if (eventType === 'C2C_MESSAGE_CREATE') {
    return t('page.database.targetPrivate')
  }
  return t('page.database.target')
}

function requestDeleteThread(thread: DatabaseMessageThread) {
  threadPendingDelete.value = thread
}

async function confirmDeleteThread() {
  const thread = threadPendingDelete.value
  if (!thread) {
    return
  }
  deleting.value = true
  try {
    await databaseApi.deleteMessageThread(thread.id)
    threadPendingDelete.value = null
    if (selectedThreadId.value === thread.id) {
      selectedThreadId.value = null
      selectedThreadMessages.value = []
    }
    await loadDatabase()
    appStore.notify(t('page.database.threadDeleted'), 'success')
  } catch (error) {
    console.error('Failed to delete database message thread', error)
    appStore.notify(t('page.database.threadDeleteFailed'), 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  void loadDatabase()
})
</script>

<template>
  <div class="database-view">
    <header class="database-header">
      <div class="title-row">
        <Database :size="24" />
        <div>
          <h2>{{ t('page.database.title') }}</h2>
          <p>{{ t('page.database.subtitle') }}</p>
        </div>
      </div>
      <button class="btn btn-secondary" type="button" :disabled="loading" @click="loadDatabase">
        <RefreshCw :size="16" />
        {{ t('page.database.refresh') }}
      </button>
    </header>

    <section class="metric-grid">
      <div class="metric-card">
        <span>{{ t('page.database.references') }}</span>
        <strong>{{ references.length }}</strong>
      </div>
      <div class="metric-card">
        <span>{{ t('page.database.messageThreads') }}</span>
        <strong>{{ threads.length }}</strong>
      </div>
      <div class="metric-card">
        <span>{{ t('page.database.messages') }}</span>
        <strong>{{ selectedThreadMessageCount }}</strong>
      </div>
    </section>

    <section class="database-grid">
      <div class="panel">
        <h3>{{ t('page.database.messageThreads') }}</h3>
        <div v-if="threads.length === 0" class="empty-state">
          {{ t('page.database.noThreads') }}
        </div>
        <div
          v-for="thread in threads"
          :key="thread.id"
          class="thread-row"
          :class="{ active: thread.id === selectedThreadId }"
          @click="selectThread(thread.id)"
        >
          <div class="thread-content">
            <span class="thread-title">{{ thread.title }}</span>
            <span class="thread-meta">
              {{ t('page.database.class') }}: {{ thread.conversationClass }}
            </span>
            <span class="thread-meta">
              {{ t('page.database.owner') }}:
              <span class="id-chip" :title="thread.ownerUserId">{{ formatExternalId(thread.ownerUserId) }}</span>
            </span>
            <span class="thread-meta">
              {{ threadTargetLabel(thread) }}:
              <span class="id-chip" :title="thread.targetId">{{ formatExternalId(thread.targetId) }}</span>
            </span>
          </div>
          <button
            class="thread-delete"
            type="button"
            :title="t('page.database.deleteThread')"
            @click.stop="requestDeleteThread(thread)"
          >
            <Trash2 :size="15" />
          </button>
        </div>
      </div>

      <div class="panel">
        <h3>{{ t('page.database.references') }}</h3>
        <div v-if="references.length === 0" class="empty-state">
          {{ t('page.database.noReferences') }}
        </div>
        <div v-for="reference in references" :key="reference.id" class="reference-row">
          <span class="thread-title">{{ reference.title }}</span>
          <span class="thread-meta">{{ reference.namespace }}</span>
          <span class="thread-meta">
            {{ t('page.database.updated') }}: {{ formatTime(reference.updatedAt) }}
          </span>
        </div>
      </div>
    </section>

    <section v-if="selectedThread" class="panel">
      <h3>{{ selectedThread.title }}</h3>
      <div class="selected-meta">
        <span>{{ selectedThread.conversationClass }}</span>
        <span>{{ t('page.database.owner') }}: {{ formatExternalId(selectedThread.ownerUserId) }}</span>
        <span>{{ threadTargetLabel(selectedThread) }}: {{ formatExternalId(selectedThread.targetId) }}</span>
      </div>
      <div v-if="selectedThreadMessages.length === 0" class="empty-state">
        {{ t('page.database.noMessages') }}
      </div>
      <div v-else class="message-list">
        <div v-for="message in selectedThreadMessages" :key="message.id" class="message-row">
          <div class="message-row-header">
            <span>{{ message.direction }} / {{ message.senderType }}</span>
            <span>{{ formatTime(message.createdAt) }}</span>
          </div>
          <p>{{ message.content }}</p>
        </div>
      </div>
    </section>

    <Transition name="modal">
      <div v-if="threadPendingDelete" class="modal-overlay" @click.self="threadPendingDelete = null">
        <div class="modal database-confirm-modal">
          <div class="modal-header">
            <h2 class="modal-title">{{ t('page.database.deleteThreadTitle') }}</h2>
          </div>
          <div class="modal-body">
            <p class="confirm-message">
              {{ t('page.database.deleteThreadConfirm', { title: threadPendingDelete.title }) }}
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" :disabled="deleting" @click="threadPendingDelete = null">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-danger" type="button" :disabled="deleting" @click="confirmDeleteThread">
              <Trash2 :size="16" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.database-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.database-header,
.title-row,
.metric-grid,
.database-grid,
.selected-meta {
  display: flex;
  gap: var(--spacing-4);
}

.database-header {
  align-items: center;
  justify-content: space-between;
}

.title-row {
  align-items: center;
}

.title-row h2,
.panel h3 {
  margin: 0;
  color: var(--text-primary);
}

.title-row p {
  margin: var(--spacing-1) 0 0;
  color: var(--text-secondary);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card,
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
}

.metric-card span,
.thread-meta,
.empty-state,
.selected-meta {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.metric-card strong {
  color: var(--text-primary);
  font-size: var(--font-size-2xl);
}

.database-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
}

.thread-row,
.reference-row {
  display: flex;
  gap: var(--spacing-1);
  width: 100%;
  padding: var(--spacing-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  text-align: left;
}

.thread-row {
  align-items: flex-start;
  justify-content: space-between;
  cursor: pointer;
}

.reference-row {
  flex-direction: column;
}

.thread-row:hover,
.thread-row.active {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.thread-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--spacing-1);
  min-width: 0;
}

.thread-title {
  color: var(--text-primary);
  font-weight: 600;
}

.id-chip {
  display: inline-flex;
  max-width: 12rem;
  padding: 0 var(--spacing-2);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.thread-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
}

.thread-delete:hover {
  background: color-mix(in srgb, var(--status-error) 14%, transparent);
  border-color: color-mix(in srgb, var(--status-error) 40%, transparent);
  color: var(--status-error);
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.message-row {
  padding: var(--spacing-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.message-row-header {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-3);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.message-row p,
.confirm-message {
  margin: var(--spacing-2) 0 0;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.database-confirm-modal {
  max-width: 30rem;
}

@media (max-width: 900px) {
  .database-header,
  .database-grid {
    grid-template-columns: 1fr;
  }

  .database-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
