<template>
  <div class="agents-view">
    <div class="agents-header">
      <div class="header-info">
        <h2>{{ t('page.agents.title') }}</h2>
        <p>{{ t('page.agents.subtitle') }}</p>
      </div>
      <button class="btn btn-primary" @click="openAddModal">
        <Plus :size="16" />
        {{ t('common.add') }}
      </button>
    </div>

    <div class="agents-grid" v-if="agentsStore.agents.length > 0">
      <div
        v-for="agent in agentsStore.agents"
        :key="agent.id"
        class="agent-card"
      >
        <div class="card-header">
          <div class="agent-name">{{ agent.name }}</div>
          <span :class="['badge', agent.enabled ? 'badge-success' : 'badge-muted']">
            {{ agent.enabled ? t('common.enabled') : t('common.disabled') }}
          </span>
        </div>

        <div class="card-body">
          <div class="model-badge" v-if="getModelDisplay(agent.modelId)">
            <Cpu :size="12" />
            {{ getModelDisplay(agent.modelId) }}
          </div>

          <div class="tool-capability-badge">
            <Wrench :size="12" />
            {{ t(`page.agents.toolCapability.${agent.toolCapability || 'full_access'}`) }}
          </div>

          <div class="callable-toggle" v-if="agent.isCallable">
            <span class="callable-label">{{ t('common.callable') }}</span>
            <span class="callable-desc" v-if="agent.description">{{ agent.description }}</span>
          </div>

          <div class="prompt-preview">
            <span class="preview-label">{{ t('common.prompt') }}:</span>
            <span class="preview-text">{{ truncatePrompt(agent.prompt) }}</span>
          </div>
        </div>

        <div class="card-footer">
          <button class="btn btn-ghost btn-sm" @click="openEditModal(agent)">
            <Pencil :size="14" />
            {{ t('common.edit') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <Bot :size="64" class="empty-icon" />
      <p>{{ t('page.agents.noAgents') }}</p>
      <button class="btn btn-primary" @click="openAddModal">
        <Plus :size="16" />
        {{ t('page.agents.addFirst') }}
      </button>
    </div>

    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ isEditing ? t('page.agents.editAgent') : t('page.agents.addAgent') }}</h3>
            <button class="modal-close" @click="closeModal">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="required">{{ t('common.name') }}</label>
              <input
                v-model="formData.name"
                type="text"
                class="input"
                :placeholder="t('page.agents.namePlaceholder')"
              />
            </div>

            <div class="form-group">
              <label>{{ t('common.model') }}</label>
              <div class="model-select-group">
                <div class="custom-select">
                  <button class="select-trigger" @click="providerDropdownOpen = !providerDropdownOpen">
                    <span>{{ selectedProviderName || t('page.agents.selectProvider') }}</span>
                    <ChevronDown :size="16" :class="['chevron', { rotated: providerDropdownOpen }]" />
                  </button>
                  <Transition name="dropdown">
                    <div v-if="providerDropdownOpen" class="select-dropdown">
                      <button
                        v-for="provider in modelProviderStore.providers"
                        :key="provider.id"
                        :class="['select-option', { active: selectedProviderId === provider.id }]"
                        @click="selectProvider(provider.id)"
                      >
                        <span>{{ provider.name }}</span>
                        <Check v-if="selectedProviderId === provider.id" :size="14" />
                      </button>
                    </div>
                  </Transition>
                </div>
                <div class="custom-select">
                  <button class="select-trigger" @click="modelDropdownOpen = !modelDropdownOpen" :disabled="!selectedProviderId">
                    <span>{{ selectedModelName || t('page.agents.selectModel') }}</span>
                    <ChevronDown :size="16" :class="['chevron', { rotated: modelDropdownOpen }]" />
                  </button>
                  <Transition name="dropdown">
                    <div v-if="modelDropdownOpen" class="select-dropdown">
                      <button
                        v-for="model in availableModels"
                        :key="model"
                        :class="['select-option', { active: formData.modelId === model }]"
                        @click="selectModel(model)"
                      >
                        <span>{{ model }}</span>
                        <Check v-if="formData.modelId === model" :size="14" />
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>{{ t('page.agents.toolCapability.label') }}</label>
              <div class="custom-select tool-capability-select">
                <button class="select-trigger" @click="toolCapabilityDropdownOpen = !toolCapabilityDropdownOpen">
                  <span>{{ selectedToolCapabilityLabel }}</span>
                  <ChevronDown :size="16" :class="['chevron', { rotated: toolCapabilityDropdownOpen }]" />
                </button>
                <Transition name="dropdown">
                  <div v-if="toolCapabilityDropdownOpen" class="select-dropdown">
                    <button
                      v-for="option in toolCapabilityOptions"
                      :key="option.value"
                      :class="['select-option tool-capability-option', { active: formData.toolCapability === option.value }]"
                      @click="selectToolCapability(option.value)"
                    >
                      <div class="option-content">
                        <span class="option-label">{{ t(option.label) }}</span>
                        <span class="option-desc">{{ t(option.desc) }}</span>
                      </div>
                      <Check v-if="formData.toolCapability === option.value" :size="14" />
                    </button>
                  </div>
                </Transition>
              </div>
            </div>

            <div class="form-group">
              <div class="toggle-row">
                <label>{{ t('common.callableByOthers') }}</label>
                <label class="toggle">
                  <input type="checkbox" v-model="formData.isCallable" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="callable-desc-field" v-if="formData.isCallable">
                <label>{{ t('page.agents.whenToCall') }}</label>
                <input
                  v-model="formData.description"
                  type="text"
                  class="input"
                  :placeholder="t('page.agents.descriptionPlaceholder')"
                />
              </div>
              <div class="callable-desc-field disabled" v-else>
                <label>{{ t('page.agents.whenToCall') }}</label>
                <input
                  v-model="formData.description"
                  type="text"
                  class="input"
                  :placeholder="t('page.agents.descriptionPlaceholder')"
                  disabled
                />
              </div>
            </div>

            <div class="form-group">
              <label>{{ t('common.prompt') }}</label>
              <textarea
                v-model="formData.prompt"
                class="input textarea"
                rows="4"
                :placeholder="t('page.agents.promptPlaceholder')"
              ></textarea>
            </div>

            <div class="form-group">
              <div class="toggle-row">
                <label>{{ t('common.enabled') }}</label>
                <label class="toggle">
                  <input type="checkbox" v-model="formData.enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" @click="saveAgent" :disabled="!isFormValid">
              <Save :size="16" />
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, X, Bot, Cpu, Save, ChevronDown, Check, Wrench } from 'lucide-vue-next'
import { useAgentsStore, type Agent, type ToolCapability } from '@/stores/agents'
import { useModelProviderStore } from '@/stores/modelProviders'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const appStore = useAppStore()
const agentsStore = useAgentsStore()
const modelProviderStore = useModelProviderStore()

const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)

const formData = ref({
  name: '',
  modelId: '',
  isCallable: false,
  description: '',
  prompt: '',
  enabled: true,
  toolCapability: 'full_access' as ToolCapability
})

const selectedProviderId = ref('')
const providerDropdownOpen = ref(false)
const modelDropdownOpen = ref(false)
const toolCapabilityDropdownOpen = ref(false)

const toolCapabilityOptions: { value: ToolCapability; label: string; desc: string }[] = [
  { value: 'full_access', label: 'page.agents.toolCapability.full_access', desc: 'page.agents.toolCapability.fullAccessDesc' },
  { value: 'web_retrieval', label: 'page.agents.toolCapability.web_retrieval', desc: 'page.agents.toolCapability.webRetrievalDesc' },
  { value: 'none', label: 'page.agents.toolCapability.none', desc: 'page.agents.toolCapability.noneDesc' }
]

const availableModels = computed(() => {
  if (!selectedProviderId.value) return []
  const provider = modelProviderStore.providers.find(p => p.id === selectedProviderId.value)
  if (!provider) return []
  if (provider.selectedModels.length > 0) return provider.selectedModels
  return provider.models.map(m => typeof m === 'string' ? m : m.id)
})

const selectedProviderName = computed(() => {
  if (!selectedProviderId.value) return ''
  const provider = modelProviderStore.providers.find(p => p.id === selectedProviderId.value)
  return provider?.name || ''
})

const selectedModelName = computed(() => {
  if (!formData.value.modelId) return ''
  return formData.value.modelId
})

const selectedToolCapabilityLabel = computed(() => {
  const option = toolCapabilityOptions.find(o => o.value === formData.value.toolCapability)
  return option ? t(option.label) : ''
})

function selectToolCapability(value: ToolCapability) {
  formData.value.toolCapability = value
  toolCapabilityDropdownOpen.value = false
}

function selectProvider(id: string) {
  selectedProviderId.value = id
  formData.value.modelId = ''
  providerDropdownOpen.value = false
}

function selectModel(model: string) {
  formData.value.modelId = model
  modelDropdownOpen.value = false
}

const isFormValid = computed(() => {
  return formData.value.name.trim() && formData.value.modelId.trim()
})

onMounted(() => {
  agentsStore.init()
  modelProviderStore.loadFromApi()
})

function getModelDisplay(modelId: string): string {
  if (!modelId) return ''
  const provider = modelProviderStore.providers.find(p => p.id === modelId)
  if (!provider) return ''
  const model = provider.selectedModels[0] || provider.defaultModel
  return model || provider.name
}

function truncatePrompt(prompt: string): string {
  if (!prompt) return ''
  return prompt.length > 80 ? prompt.substring(0, 80) + '…' : prompt
}

function openAddModal() {
  isEditing.value = false
  editingId.value = null
  selectedProviderId.value = ''
  formData.value = {
    name: '',
    modelId: '',
    isCallable: false,
    description: '',
    prompt: '',
    enabled: true,
    toolCapability: 'full_access'
  }
  providerDropdownOpen.value = false
  modelDropdownOpen.value = false
  toolCapabilityDropdownOpen.value = false
  showModal.value = true
}

function openEditModal(agent: Agent) {
  isEditing.value = true
  editingId.value = agent.id
  const provider = modelProviderStore.providers.find(p => 
    p.selectedModels.includes(agent.modelId) || p.models.some(m => typeof m === 'string' ? m === agent.modelId : m.id === agent.modelId)
  )
  selectedProviderId.value = provider?.id || ''
  formData.value = {
    name: agent.name,
    modelId: agent.modelId,
    isCallable: agent.isCallable,
    description: agent.description || '',
    prompt: agent.prompt,
    enabled: agent.enabled,
    toolCapability: agent.toolCapability || 'full_access'
  }
  providerDropdownOpen.value = false
  modelDropdownOpen.value = false
  toolCapabilityDropdownOpen.value = false
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  isEditing.value = false
  editingId.value = null
  selectedProviderId.value = ''
  providerDropdownOpen.value = false
  modelDropdownOpen.value = false
  toolCapabilityDropdownOpen.value = false
}

function saveAgent() {
  if (!isFormValid.value) return

  if (isEditing.value && editingId.value) {
    agentsStore.updateAgent(editingId.value, { ...formData.value })
    appStore.notify(t('page.agents.agentUpdated'), 'success')
  } else {
    agentsStore.addAgent({ ...formData.value })
    appStore.notify(t('page.agents.agentAdded'), 'success')
  }
  closeModal()
}
</script>

<style scoped>
.agents-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.agents-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info h2 {
  margin: 0 0 4px 0;
  font-size: 1.5rem;
}

.header-info p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
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

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.agent-name {
  font-weight: 600;
  font-size: 1.1rem;
}

.badge {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-success {
  background: rgba(16, 185, 129, 0.15);
  color: var(--status-connected);
}

.badge-muted {
  background: var(--badge-muted-bg);
  color: var(--text-muted);
}

.card-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.model-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--accent-primary);
  width: fit-content;
}

.tool-capability-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--text-secondary);
  width: fit-content;
}

.tool-capability-select .select-dropdown {
  max-height: 240px;
}

.tool-capability-option {
  flex-direction: row;
  align-items: flex-start;
  padding: 12px;
}

.tool-capability-option .option-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.tool-capability-option .option-label {
  font-size: 0.9rem;
  font-weight: 500;
}

.tool-capability-option .option-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.callable-toggle {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.callable-label {
  font-size: 0.75rem;
  color: var(--accent-primary);
  font-weight: 500;
}

.callable-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.prompt-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.preview-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.card-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: 480px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.modal-close {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.modal-close:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 24px;
  overflow-y: overlay;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.form-group label.required::after {
  content: ' *';
  color: var(--status-error);
}

.model-select-group {
  display: flex;
  gap: 8px;
}

.custom-select {
  position: relative;
  flex: 1;
}

.select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-trigger:hover {
  border-color: var(--border-color-hover);
}

.select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-trigger .chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.select-trigger .chevron.rotated {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px;
  z-index: 10;
  box-shadow: var(--shadow-md);
  max-height: 200px;
  overflow-y: overlay;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-option:hover {
  background: var(--bg-hover);
}

.select-option.active {
  color: var(--accent-primary);
}

.select-option .check-icon {
  color: var(--accent-primary);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.callable-desc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.callable-desc-field label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.callable-desc-field.disabled input {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  transition: all var(--transition-fast);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.toggle input:checked + .toggle-slider {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.textarea {
  resize: vertical;
  min-height: 100px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: scale(0.95);
  opacity: 0;
}
</style>