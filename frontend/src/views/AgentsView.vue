<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Bot, Trash2, Edit2 } from 'lucide-vue-next'
import { Card, CardContent } from '@/components'
import { useAgentsStore } from '@/stores'
import { useI18n } from '@/i18n'

const store = useAgentsStore()
const router = useRouter()
const { t } = useI18n()
const agents = computed(() => store.agents)

onMounted(async () => {
  await store.fetchAgents()
})

async function handleCreateAgent() {
  const agent = await store.createAgent({
    name: `${t('common.agent')} ${store.agents.length + 1}`,
    description: t('page.agents.defaultDescription'),
    instructions: t('page.agents.defaultInstructions'),
    tools: []
  })
  await router.push(`/agents/${agent.id}`)
}

async function handleDeleteAgent(id: string) {
  await store.deleteAgent(id)
}
</script>

<template>
  <div class="agents-view">
    <div class="view-toolbar">
      <button class="btn btn-primary" @click="handleCreateAgent">
        <Plus :size="18" />
        {{ t('page.agents.addAgent') }}
      </button>
    </div>

    <div v-if="agents.length === 0" class="empty-state">
      <Bot :size="48" class="empty-icon" />
      <h3>{{ t('page.agents.noAgents') }}</h3>
      <p>{{ t('page.agents.createFirst') }}</p>
      <button class="btn btn-primary" @click="handleCreateAgent">
        <Plus :size="18" />
        {{ t('page.agents.addFirst') }}
      </button>
    </div>

    <div v-else class="agents-grid">
      <Card
        v-for="agent in agents"
        :key="agent.id"
        class="agent-card card-hover"
      >
        <CardContent class="agent-content">
          <div class="agent-info">
            <h3 class="agent-name">{{ agent.name }}</h3>
            <p class="agent-description">{{ agent.description }}</p>
          </div>
          <div class="agent-actions">
            <button class="btn btn-ghost btn-icon" @click="router.push(`/agents/${agent.id}`)">
              <Edit2 :size="16" />
            </button>
            <button class="btn btn-ghost btn-icon" @click="handleDeleteAgent(agent.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.agents-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.view-toolbar {
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.4;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  flex: 1;
  overflow-y: overlay;
}

.agent-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  transition: all var(--transition-fast);
}

.agent-card:hover {
  border-color: var(--border-color-hover);
  box-shadow: var(--shadow-sm);
}

.agent-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  flex: 1;
}

.agent-info {
  flex: 1;
}

.agent-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.agent-description {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.agent-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>
