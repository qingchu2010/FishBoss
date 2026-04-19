<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { FileText } from 'lucide-vue-next'
import { Card, CardContent } from '@/components'
import { logsApi, type LogEntry } from '@/services/logs'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const entries = ref<LogEntry[]>([])
const loading = ref(false)

async function loadLogs() {
  loading.value = true
  try {
    const response = await logsApi.getLogs({ limit: 100 })
    entries.value = response.entries
  } finally {
    loading.value = false
  }
}

onMounted(loadLogs)
</script>

<template>
  <div class="logs-view">
    <div class="view-toolbar">
      <button class="btn btn-secondary" @click="loadLogs">Refresh</button>
    </div>

    <Card>
      <CardContent>
        <div v-if="loading" class="empty-state">
          <p>{{ t('common.loading') }}</p>
        </div>
        <div v-else-if="entries.length === 0" class="empty-state">
          <FileText :size="48" class="empty-icon" />
          <h3>{{ t('logs.empty') }}</h3>
          <p>{{ t('logs.hint') }}</p>
        </div>
        <div v-else class="logs-list">
          <div v-for="entry in entries" :key="`${entry.timestamp}-${entry.message}`" :class="['log-row', entry.levelName.toLowerCase()]">
            <span class="log-time">{{ new Date(entry.timestamp).toLocaleString() }}</span>
            <span :class="['log-level', entry.levelName.toLowerCase()]">{{ entry.levelName }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<style scoped>
.logs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}

.view-toolbar {
  display: flex;
  justify-content: flex-end;
}

.logs-list {
  overflow-y: overlay;
  display: flex;
  flex-direction: column;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.4;
}

.log-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
  font-size: 0.85rem;
  line-height: 1.4;
}

.log-row:hover {
  background: var(--bg-hover);
}

.log-row.info {
  border-left-color: var(--status-success);
}

.log-row.warn {
  border-left-color: var(--status-warning);
}

.log-row.error {
  border-left-color: var(--status-error);
}

.log-row.debug {
  border-left-color: #6f7d9d;
}

.log-row.fatal {
  border-left-color: #a855f7;
}

.log-time {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.log-level {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.log-level.info {
  background: rgba(16, 185, 129, 0.2);
  color: var(--status-success);
}

.log-level.warn {
  background: rgba(245, 158, 11, 0.2);
  color: var(--status-warning);
}

.log-level.error {
  background: rgba(239, 68, 68, 0.2);
  color: var(--status-error);
}

.log-level.debug {
  background: rgba(111, 125, 157, 0.2);
  color: #6f7d9d;
}

.log-level.fatal {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.log-message {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
