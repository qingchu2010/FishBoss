<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { GitBranch } from 'lucide-vue-next'
import { Card, CardContent } from '@/components'
import { workflowsApi, type Workflow } from '@/services/workflows'
import { useI18n } from '@/i18n'

const workflows = ref<Workflow[]>([])
const { t } = useI18n()

onMounted(async () => {
  workflows.value = await workflowsApi.list()
})
</script>

<template>
  <div class="workflows-view">
    <div v-if="workflows.length === 0" class="empty-state">
      <GitBranch :size="48" class="empty-icon" />
      <h3>{{ t('common.noData') }}</h3>
      <p>{{ t('page.default.subtitle') }}</p>
    </div>

    <div v-else class="workflow-grid">
      <Card v-for="workflow in workflows" :key="workflow.id">
        <CardContent class="workflow-content">
          <h3>{{ workflow.name }}</h3>
          <p>{{ workflow.description }}</p>
          <p>{{ t('common.description') }}: {{ workflow.steps.length }}</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.workflows-view { max-width: 1200px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--spacing-12); text-align: center; gap: var(--spacing-4); }
.workflow-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--spacing-4); }
.workflow-content { display: flex; flex-direction: column; gap: var(--spacing-2); padding: var(--spacing-4); }
</style>
