<template>
  <div class="logs-view">
    <div class="logs-header">
      <div class="logs-filter">
        <button
          v-for="level in levels"
          :key="level.value"
          :class="['btn', 'btn-sm', activeFilter === level.value ? 'btn-primary' : 'btn-secondary']"
          @click="activeFilter = level.value"
        >
          {{ t(level.label) }}
        </button>
      </div>
      <button class="btn btn-secondary" @click="clearLogs">
        {{ t('logs.clear') }}
      </button>
    </div>

    <div class="logs-list scrollbar">
      <div v-if="filteredLogs.length === 0" class="logs-empty">
        <FileText :size="48" />
        <p>{{ t('logs.empty') }}</p>
      </div>

      <div
        v-for="log in filteredLogs"
        :key="log.id"
        :class="['log-item', log.level]"
      >
        <div class="log-header">
          <span :class="['log-level', log.level]">{{ t(log.level) }}</span>
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
        </div>
        <div class="log-message">{{ log.message }}</div>
        <div v-if="log.data" class="log-data">
          <pre>{{ JSON.stringify(log.data, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { FileText } from 'lucide-vue-next'
import { useLogStore } from '@/stores/logs'
import { useI18n } from '@/i18n'
import { storeToRefs } from 'pinia'

const { t } = useI18n()
const logStore = useLogStore()
const { logs } = storeToRefs(logStore)

const activeFilter = ref<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')

const levels = [
  { value: 'all' as const, label: 'logs.all' },
  { value: 'info' as const, label: 'logs.info' },
  { value: 'warn' as const, label: 'logs.warn' },
  { value: 'error' as const, label: 'logs.error' },
  { value: 'debug' as const, label: 'logs.debug' }
]

const filteredLogs = computed(() => {
  const sorted = [...logs.value].sort((a, b) => b.timestamp - a.timestamp)
  if (activeFilter.value === 'all') {
    return sorted
  }
  return sorted.filter(log => log.level === activeFilter.value)
})

function clearLogs() {
  logStore.clearLogs()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.logs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logs-filter {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.875rem;
}

.logs-list {
  flex: 1;
  min-height: 0;
  overflow-y: overlay;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logs-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.log-item {
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border-left: 3px solid;
}

.log-item.info {
  border-color: var(--accent-primary);
}

.log-item.warn {
  border-color: var(--status-warn);
}

.log-item.error {
  border-color: var(--status-error);
}

.log-item.debug {
  border-color: var(--text-muted);
}

.log-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.log-level {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.log-level.info {
  background: var(--accent-primary);
  color: white;
}

.log-level.warn {
  background: var(--status-warn);
  color: white;
}

.log-level.error {
  background: var(--status-error);
  color: white;
}

.log-level.debug {
  background: var(--text-muted);
  color: white;
}

.log-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.log-message {
  font-size: 0.9rem;
  word-break: break-word;
}

.log-data {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
}

.log-data pre {
  font-size: 0.75rem;
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-muted);
}
</style>
