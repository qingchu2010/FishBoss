<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCw, Users } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { groupsApi, type GroupStatus } from '@/services/groups'
import { useAppStore } from '@/stores'

const { t } = useI18n()
const appStore = useAppStore()
const loading = ref(false)
const status = ref<GroupStatus | null>(null)

async function loadStatus() {
  loading.value = true
  try {
    status.value = await groupsApi.getStatus()
  } catch (error) {
    console.error('Failed to load group status', error)
    appStore.notify(t('page.groups.loadFailed'), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadStatus()
})
</script>

<template>
  <div class="groups-view">
    <header class="groups-header">
      <div class="title-row">
        <Users :size="24" />
        <div>
          <h2>{{ t('page.groups.title') }}</h2>
          <p>{{ t('page.groups.subtitle') }}</p>
        </div>
      </div>
      <button class="btn btn-secondary" type="button" :disabled="loading" @click="loadStatus">
        <RefreshCw :size="16" :class="{ spin: loading }" />
        {{ t('common.refresh') }}
      </button>
    </header>

    <section class="groups-panel">
      <span class="status-badge muted">{{ t('page.groups.reserved') }}</span>
      <h3>{{ status?.message ?? t('page.groups.reservedTitle') }}</h3>
      <p>{{ status?.featureDescription ?? t('page.groups.reservedDescription') }}</p>
    </section>
  </div>
</template>

<style scoped>
.groups-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.groups-header,
.title-row {
  display: flex;
  gap: var(--spacing-4);
}

.groups-header {
  align-items: center;
  justify-content: space-between;
}

.title-row {
  align-items: center;
}

.title-row h2,
.groups-panel h3 {
  margin: 0;
  color: var(--text-primary);
}

.title-row p,
.groups-panel p {
  margin: var(--spacing-1) 0 0;
  color: var(--text-secondary);
}

.groups-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  max-width: 42rem;
  padding: var(--spacing-5);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .groups-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
