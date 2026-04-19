<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Save, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle, AppSelect } from '@/components'
import { useAgentsStore, useProvidersStore, useToolsStore } from '@/stores'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores'

const route = useRoute()
const router = useRouter()
const agentsStore = useAgentsStore()
const providersStore = useProvidersStore()
const toolsStore = useToolsStore()
const appStore = useAppStore()
const { t } = useI18n()

const agentId = computed(() => route.params.id as string)
const agent = computed(() => agentsStore.currentAgent)

const editForm = ref({
  name: '',
  description: '',
  instructions: '',
  provider: '',
  model: '',
  tools: [] as string[],
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  responseFormat: 'text' as 'text' | 'json'
})

const showAdvanced = ref(false)
const saving = ref(false)
const toolkitTools = computed(() => toolsStore.tools)

const providers = computed(() => providersStore.providers)
const selectedProviderModels = computed(() => {
  if (!editForm.value.provider) return []
  const provider = providersStore.providers.find(p => p.id === editForm.value.provider)
  if (!provider || !provider.models.length) return []
  const allModels = providersStore.providerModels[editForm.value.provider] ?? []
  return allModels.filter(m => provider.models.includes(m.id))
})

const providerOptions = computed(() =>
  providers.value.map(p => ({ value: p.id, label: p.name }))
)

const modelOptions = computed(() =>
  selectedProviderModels.value.map(m => ({ value: m.id, label: m.name || m.id }))
)

const responseFormatOptions = computed(() => [
  { value: 'text', label: t('page.agents.responseFormatText') },
  { value: 'json', label: t('page.agents.responseFormatJson') }
])

onMounted(async () => {
  await Promise.all([
    providersStore.fetchProviders(),
    toolsStore.fetchTools(),
    agentsStore.fetchAgent(agentId.value)
  ])
  syncEditForm()
})

watch(agent, () => {
  syncEditForm()
})

function syncEditForm() {
  if (!agent.value) return
  editForm.value = {
    name: agent.value.name,
    description: agent.value.description,
    instructions: agent.value.instructions,
    provider: agent.value.provider ?? '',
    model: agent.value.model ?? '',
    tools: [...(agent.value.toolPermissions?.allowedTools ?? agent.value.tools ?? [])],
    temperature: (agent.value.settings?.temperature as number) ?? 0.7,
    maxTokens: (agent.value.settings?.maxTokens as number) ?? 4096,
    topP: (agent.value.settings?.topP as number) ?? 1,
    frequencyPenalty: (agent.value.settings?.frequencyPenalty as number) ?? 0,
    presencePenalty: (agent.value.settings?.presencePenalty as number) ?? 0,
    responseFormat: (agent.value.settings?.responseFormat as 'text' | 'json') ?? 'text'
  }
  if (editForm.value.provider) {
    providersStore.loadModels(editForm.value.provider)
  }
}

async function onProviderChange(providerId: string) {
  editForm.value.model = ''
  if (providerId) {
    await providersStore.loadModels(providerId)
  }
}

function toggleTool(toolName: string) {
  if (editForm.value.tools.includes(toolName)) {
    editForm.value.tools = editForm.value.tools.filter((item) => item !== toolName)
    return
  }
  editForm.value.tools = [...editForm.value.tools, toolName]
}

async function saveAgent() {
  if (!agent.value) return
  saving.value = true
  try {
    const allowedTools = [...editForm.value.tools]
    const deniedTools = toolkitTools.value
      .map((tool) => tool.id)
      .filter((tool) => !allowedTools.includes(tool))
    await agentsStore.updateAgent(agent.value.id, {
      name: editForm.value.name,
      description: editForm.value.description,
      instructions: editForm.value.instructions,
      provider: editForm.value.provider || undefined,
      model: editForm.value.model || undefined,
      tools: allowedTools,
      toolPermissions: {
        allowedTools,
        deniedTools
      },
      settings: {
        temperature: editForm.value.temperature,
        maxTokens: editForm.value.maxTokens,
        topP: editForm.value.topP,
        frequencyPenalty: editForm.value.frequencyPenalty,
        presencePenalty: editForm.value.presencePenalty,
        responseFormat: editForm.value.responseFormat
      }
    })
    appStore.notify(t('page.agents.agentUpdated'), 'success')
  } catch (e) {
    appStore.notify(t('settings.saveFailed'), 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="agent-detail-view">
    <div class="page-header">
      <button class="btn btn-ghost" @click="router.push('/agents')">
        <ArrowLeft :size="18" />
        {{ t('common.back') }}
      </button>
    </div>

    <Card v-if="agent">
      <CardHeader>
        <CardTitle>{{ t('page.agents.editAgent') }}</CardTitle>
      </CardHeader>
      <CardContent class="agent-form">
        <div class="form-section">
          <h4 class="section-title">{{ t('page.agents.basicInfo') }}</h4>
          
          <div class="form-group">
            <label class="required">{{ t('common.name') }}</label>
            <input v-model="editForm.name" type="text" class="input" :placeholder="t('page.agents.namePlaceholder')" />
          </div>

          <div class="form-group">
            <label>{{ t('common.description') }}</label>
            <textarea v-model="editForm.description" class="input" rows="2" :placeholder="t('page.agents.descriptionPlaceholder')"></textarea>
          </div>

          <div class="form-group">
            <label class="required">{{ t('page.agents.prompt') }}</label>
            <textarea v-model="editForm.instructions" class="input prompt-input" rows="6" :placeholder="t('page.agents.promptPlaceholder')"></textarea>
          </div>
        </div>

        <div class="form-section">
          <h4 class="section-title">{{ t('page.agents.modelConfig') }}</h4>
          
          <div class="form-row">
            <div class="form-group">
              <label>{{ t('page.agents.provider') }}</label>
              <AppSelect
                v-model="editForm.provider"
                :options="providerOptions"
                :placeholder="t('page.agents.selectProvider')"
                @update:modelValue="(val) => onProviderChange(val as string)"
              />
            </div>

            <div class="form-group">
              <label>{{ t('common.model') }}</label>
              <AppSelect
                v-model="editForm.model"
                :options="modelOptions"
                :placeholder="t('page.agents.selectModel')"
                :disabled="!editForm.provider || selectedProviderModels.length === 0"
              />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h4 class="section-title">{{ t('page.agents.toolPermissionsTitle') }}</h4>
          <p class="section-hint">{{ t('page.agents.toolPermissionsHint') }}</p>

          <div class="tool-permissions">
            <label
              v-for="tool in toolkitTools"
              :key="tool.id"
              class="tool-permission-card"
              :class="{
                selected: editForm.tools.includes(tool.id),
                disabled: !tool.executable
              }"
            >
              <input
                :checked="editForm.tools.includes(tool.id)"
                type="checkbox"
                class="tool-checkbox"
                :disabled="!tool.executable"
                @change="toggleTool(tool.id)"
              />
              <div class="tool-permission-copy">
                <span class="tool-permission-header">
                  <span class="tool-permission-title">{{ tool.title }}</span>
                  <span
                    class="tool-permission-badge"
                    :class="tool.executable ? 'ready' : 'unavailable'"
                  >
                    {{ tool.executable ? t('chat.toolCapabilityEnabled') : t('page.agents.toolUnavailable') }}
                  </span>
                </span>
                <span class="tool-permission-hint">{{ tool.description }}</span>
              </div>
            </label>
          </div>
        </div>

        <div class="form-section">
          <button class="section-toggle" @click="showAdvanced = !showAdvanced">
            <span>{{ t('page.agents.advancedSettings') }}</span>
            <ChevronDown v-if="!showAdvanced" :size="16" />
            <ChevronUp v-else :size="16" />
          </button>

          <div v-if="showAdvanced" class="advanced-settings">
            <div class="form-row">
              <div class="form-group">
                <label>{{ t('page.agents.temperature') }}</label>
                <input v-model.number="editForm.temperature" type="number" step="0.1" min="0" max="2" class="input" />
                <span class="form-hint">{{ t('page.agents.temperatureHint') }}</span>
              </div>

              <div class="form-group">
                <label>{{ t('page.agents.maxTokens') }}</label>
                <input v-model.number="editForm.maxTokens" type="number" min="1" class="input" />
                <span class="form-hint">{{ t('page.agents.maxTokensHint') }}</span>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>{{ t('page.agents.topP') }}</label>
                <input v-model.number="editForm.topP" type="number" step="0.1" min="0" max="1" class="input" />
                <span class="form-hint">{{ t('page.agents.topPHint') }}</span>
              </div>

              <div class="form-group">
                <label>{{ t('page.agents.responseFormat') }}</label>
                <AppSelect
                  v-model="editForm.responseFormat"
                  :options="responseFormatOptions"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>{{ t('page.agents.frequencyPenalty') }}</label>
                <input v-model.number="editForm.frequencyPenalty" type="number" step="0.1" min="0" max="2" class="input" />
                <span class="form-hint">{{ t('page.agents.frequencyPenaltyHint') }}</span>
              </div>

              <div class="form-group">
                <label>{{ t('page.agents.presencePenalty') }}</label>
                <input v-model.number="editForm.presencePenalty" type="number" step="0.1" min="0" max="2" class="input" />
                <span class="form-hint">{{ t('page.agents.presencePenaltyHint') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" @click="saveAgent" :disabled="saving || !editForm.name || !editForm.instructions">
            <Save :size="16" />
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<style scoped>
.agent-detail-view {
  max-width: 900px;
}

.page-header {
  margin-bottom: var(--spacing-6);
}

.agent-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: var(--spacing-2);
  border-bottom: 1px solid var(--border-color);
}

.section-hint {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-2) 0;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.section-toggle:hover {
  color: var(--text-primary);
}

.advanced-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding-top: var(--spacing-2);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-4);
}

.prompt-input {
  min-height: 150px;
  font-family: var(--font-mono);
}

.tool-permissions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-3);
}

.tool-permission-card {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, white 8%), var(--bg-elevated));
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast),
    background var(--transition-fast);
}

.tool-permission-card:hover {
  border-color: var(--border-color-hover);
  background: var(--bg-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.tool-permission-card.selected {
  border-color: color-mix(in srgb, var(--accent-primary) 55%, var(--border-color));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 10%, var(--bg-elevated)), var(--bg-elevated));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 25%, transparent);
}

.tool-permission-card.disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.tool-permission-card.disabled:hover {
  border-color: var(--border-color);
  background: var(--bg-elevated);
}

.tool-checkbox {
  margin-top: 2px;
}

.tool-permission-copy {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  min-width: 0;
}

.tool-permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
}

.tool-permission-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  white-space: nowrap;
}

.tool-permission-badge.ready {
  background: color-mix(in srgb, var(--color-success) 15%, transparent);
  color: var(--color-success);
}

.tool-permission-badge.unavailable {
  background: var(--bg-muted);
  color: var(--text-muted);
}

.tool-permission-title {
  color: var(--text-primary);
  font-weight: 600;
  min-width: 0;
}

.tool-permission-hint {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--border-color);
}

.required::after {
  content: ' *';
  color: var(--color-error);
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .tool-permissions {
    grid-template-columns: 1fr;
  }
}
</style>
