<template>
  <div class="model-providers-view">
    <div class="providers-layout">
      <div class="providers-sidebar">
        <div class="sidebar-header">
          <h3>{{ t('page.modelProviders.myProviders') }}</h3>
          <button class="btn btn-sm btn-secondary" @click="showAddModal = true">
            <Plus :size="16" />
            {{ t('page.modelProviders.add') }}
          </button>
        </div>
        <div class="provider-list scrollbar">
          <div
            v-for="provider in modelProviderStore.providers"
            :key="provider.id"
            :class="['provider-item', { active: provider.id === modelProviderStore.activeProviderId }]"
            @click="selectProvider(provider.id)"
          >
            <div class="provider-item-info">
              <span class="provider-name">{{ provider.name }}</span>
              <span class="provider-type">{{ t(`page.modelProviders.types.${provider.type}`) }}</span>
            </div>
            <button
              class="provider-delete"
              @click.stop="deleteProvider(provider.id)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="provider-config">
        <div v-if="!currentProvider" class="no-provider">
          <img src="/favicon.svg" alt="" class="empty-icon" />
          <p>{{ t('page.modelProviders.noProviders') }}</p>
          <button class="btn btn-primary" @click="showAddModal = true">
            <Plus :size="16" />
            {{ t('page.modelProviders.addFirst') }}
          </button>
        </div>

        <div v-else class="config-form">
          <div class="config-header">
            <div class="config-info">
              <h3>{{ currentProvider.name }}</h3>
              <span :class="['badge', currentProvider.enabled ? 'badge-info' : 'badge-secondary']">
                {{ currentProvider.enabled ? t('page.modelProviders.enabled') : t('page.modelProviders.disabled') }}
              </span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="currentProvider.enabled" @change="saveProvider" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label class="required">{{ t('page.modelProviders.apiKey') }}</label>
            <input
              v-model="currentProvider.apiKey"
              type="password"
              :class="['input', { error: errors.apiKey }]"
              :placeholder="hasSavedApiKey ? t('page.modelProviders.apiKeyPlaceholderNew') : t('page.modelProviders.apiKeyPlaceholder')"
            />
            <span v-if="hasSavedApiKey" class="form-hint">
              <Check :size="12" />
              {{ t('page.modelProviders.apiKeySaved') }}
            </span>
            <span v-else-if="errors.apiKey" class="form-error">
              <AlertCircle :size="12" />
              {{ errors.apiKey }}
            </span>
          </div>

          <div class="form-group">
            <label class="required">{{ t('page.modelProviders.baseUrl') }}</label>
            <input
              v-model="currentProvider.baseUrl"
              type="text"
              :class="['input', { error: errors.baseUrl }]"
              :placeholder="t('page.modelProviders.baseUrlPlaceholder')"
            />
            <span v-if="errors.baseUrl" class="form-error">
              <AlertCircle :size="12" />
              {{ errors.baseUrl }}
            </span>
            <span v-else class="form-hint">
              <AlertCircle :size="12" />
              {{ t('page.modelProviders.baseUrlHint') }}
            </span>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label>{{ t('page.modelProviders.availableModels') }}</label>
              <button class="btn btn-sm btn-secondary" @click="fetchModels" :disabled="fetchingModels">
                <RefreshCw :size="14" :class="{ spin: fetchingModels }" />
                {{ fetchingModels ? t('page.modelProviders.fetching') : t('page.modelProviders.fetchModels') }}
              </button>
            </div>
            <div class="models-list" v-if="currentProvider.models.length > 0">
              <span
                v-for="model in currentProvider.models"
                :key="model.id"
                :class="['model-tag', { selected: currentProvider.selectedModels.includes(model.id) }]"
                @click="toggleModel(currentProvider.id, model.id)"
              >
                {{ model.name || model.id }}
              </span>
            </div>
            <p v-else class="no-models">{{ t('page.modelProviders.noModels') }}</p>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label>{{ t('page.modelProviders.selectedModels') }}</label>
              <button class="btn btn-sm btn-ghost" @click="showCustomModelInput = !showCustomModelInput">
                <Plus :size="14" />
                {{ t('common.add') }}
              </button>
            </div>
            <div v-if="showCustomModelInput" class="custom-model-input">
              <input
                v-model="customModelId"
                type="text"
                class="input"
                :placeholder="t('page.modelProviders.modelIdPlaceholder')"
                @keyup.enter="addCustomModel"
              />
              <button class="btn btn-sm btn-primary" @click="addCustomModel">
                <Check :size="14" />
              </button>
            </div>
            <div class="selected-models" v-if="currentProvider.selectedModels.length > 0">
              <div
                v-for="model in currentProvider.selectedModels"
                :key="model"
                :class="['selected-model', { default: model === currentProvider.defaultModel }]"
                @click="setDefaultModel(currentProvider.id, model)"
              >
                <Star :size="12" :class="{ filled: model === currentProvider.defaultModel }" />
                <span>{{ model }}</span>
                <button class="remove-btn" @click.stop="removeModel(currentProvider.id, model)">
                  <X :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-secondary" @click="testReply" :disabled="!currentProvider.defaultModel">
              <Zap :size="16" />
              {{ t('page.modelProviders.testReply') }}
            </button>
            <button class="btn btn-primary" @click="saveProvider" :disabled="!isFormValid">
              <Save :size="16" />
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showAddModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ showCustomForm ? t('page.modelProviders.addCustomProvider') : t('page.modelProviders.addProvider') }}</h3>
            <button class="modal-close" @click="closeModal">
              <X :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <div v-if="!showCustomForm" class="preset-list">
              <div
                v-for="preset in modelProviderStore.presetProviders"
                :key="preset.name"
                class="preset-item"
                @click="addPreset(preset)"
              >
                <div class="preset-icon">
                  <Cpu :size="20" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ getPresetName(preset.name) }}</span>
                  <span class="preset-url">{{ preset.baseUrl }}</span>
                </div>
              </div>

              <div class="divider">
                <span>{{ t('page.modelProviders.orCustom') }}</span>
              </div>

              <div class="preset-item custom-item" @click="showCustomForm = true">
                <div class="preset-icon">
                  <Plus :size="20" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ t('page.modelProviders.customProvider') }}</span>
                  <span class="preset-url">{{ t('page.modelProviders.customProviderHint') }}</span>
                </div>
              </div>
            </div>

            <div v-else class="custom-form">
              <div class="form-group">
                <label class="required">{{ t('page.modelProviders.providerName') }}</label>
                <input
                  v-model="customName"
                  type="text"
                  :class="['input', { error: customErrors.name }]"
                  :placeholder="t('page.modelProviders.namePlaceholder')"
                />
                <span v-if="customErrors.name" class="form-error">
                  <AlertCircle :size="12" />
                  {{ customErrors.name }}
                </span>
              </div>
              <div class="form-group">
                <label class="required">{{ t('page.modelProviders.baseUrl') }}</label>
                <input
                  v-model="customBaseUrl"
                  type="text"
                  :class="['input', { error: customErrors.baseUrl }]"
                  :placeholder="t('page.modelProviders.baseUrlPlaceholder')"
                />
                <span v-if="customErrors.baseUrl" class="form-error">
                  <AlertCircle :size="12" />
                  {{ customErrors.baseUrl }}
                </span>
              </div>
              <div class="form-actions">
                <button class="btn btn-secondary" @click="showCustomForm = false">
                  {{ t('common.cancel') }}
                </button>
                <button class="btn btn-primary" @click="addCustom" :disabled="!isCustomFormValid">
                  {{ t('page.modelProviders.addCustom') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Trash2, AlertCircle, RefreshCw, Zap, Save, X, Cpu, Check, Star } from 'lucide-vue-next'
import { useModelProviderStore, type PresetProvider } from '@/stores/modelProviders'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { api } from '@/services/api'

const { t } = useI18n()
const appStore = useAppStore()
const modelProviderStore = useModelProviderStore()

const showAddModal = ref(false)
const showCustomForm = ref(false)
const customName = ref('')
const customBaseUrl = ref('')
const fetchingModels = ref(false)
const showCustomModelInput = ref(false)
const customModelId = ref('')

const URL_REGEX = /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(:[0-9]+)?(\/[^\s]*)?$/

onMounted(() => {
  modelProviderStore.init().catch((error) => {
    console.error('Failed to load providers:', error)
  })
})

const currentProvider = computed(() => {
  return modelProviderStore.providers.find(p => p.id === modelProviderStore.activeProviderId)
})

const hasSavedApiKey = computed(() => {
  return currentProvider.value?.hasApiKey && !currentProvider.value?.apiKey
})

const errors = computed(() => {
  const result = { apiKey: '', baseUrl: '' }
  if (!currentProvider.value) return result
  
  if (!currentProvider.value.hasApiKey && !currentProvider.value.apiKey?.trim()) {
    result.apiKey = t('page.modelProviders.apiKeyRequired')
  }
  
  const url = currentProvider.value.baseUrl?.trim()
  if (!url) {
    result.baseUrl = t('page.modelProviders.baseUrlRequired')
  } else if (!URL_REGEX.test(url)) {
    result.baseUrl = t('page.modelProviders.baseUrlInvalid')
  }
  
  return result
})

const customErrors = computed(() => {
  const result = { name: '', baseUrl: '' }
  
  if (!customName.value.trim()) {
    result.name = t('page.modelProviders.nameRequired')
  }
  
  const url = customBaseUrl.value.trim()
  if (!url) {
    result.baseUrl = t('page.modelProviders.baseUrlRequired')
  } else if (!URL_REGEX.test(url)) {
    result.baseUrl = t('page.modelProviders.baseUrlInvalid')
  }
  
  return result
})

const isFormValid = computed(() => {
  if (!currentProvider.value) return false
  const hasKey = currentProvider.value.hasApiKey || (currentProvider.value.apiKey?.trim() ?? '') !== ''
  return hasKey && 
         (currentProvider.value.baseUrl?.trim() ?? '') !== '' &&
         URL_REGEX.test(currentProvider.value.baseUrl?.trim() ?? '')
})

const isCustomFormValid = computed(() => {
  return customName.value.trim() !== '' && 
         customBaseUrl.value.trim() !== '' &&
         URL_REGEX.test(customBaseUrl.value.trim())
})

function closeModal() {
  showAddModal.value = false
  showCustomForm.value = false
  customName.value = ''
  customBaseUrl.value = ''
}

function selectProvider(id: string) {
  modelProviderStore.setActiveProvider(id)
}

function deleteProvider(id: string) {
  modelProviderStore.removeProvider(id)
}

function toggleModel(providerId: string, model: string) {
  modelProviderStore.toggleModel(providerId, model)
}

function removeModel(providerId: string, model: string) {
  modelProviderStore.removeModel(providerId, model)
}

function setDefaultModel(providerId: string, model: string) {
  modelProviderStore.setDefaultModel(providerId, model)
}

function addCustomModel() {
  if (!customModelId.value.trim() || !currentProvider.value) return
  modelProviderStore.toggleModel(currentProvider.value.id, customModelId.value.trim())
  customModelId.value = ''
  showCustomModelInput.value = false
}

function saveProvider() {
  if (!isFormValid.value) {
    appStore.notify(t('page.modelProviders.validationFailed'), 'error')
    return
  }
  
  if (currentProvider.value) {
    modelProviderStore.updateProvider(currentProvider.value.id, {
      ...currentProvider.value
    })
    appStore.notify(t('settings.saved'), 'success')
  }
}

async function fetchModels() {
  if (!isFormValid.value) {
    appStore.notify(t('page.modelProviders.validationFailed'), 'error')
    return
  }
  
  fetchingModels.value = true
  try {
    await modelProviderStore.fetchModels(currentProvider.value!.id)
    appStore.notify(t('page.modelProviders.modelsFetched'), 'success')
  } catch (error) {
    appStore.notify(`${t('page.modelProviders.fetchFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    fetchingModels.value = false
  }
}

async function testReply() {
  if (!currentProvider.value?.hasApiKey && !currentProvider.value?.apiKey?.trim()) {
    appStore.notify(t('page.modelProviders.apiKeyRequired'), 'error')
    return
  }
  
  if (!currentProvider.value?.defaultModel) {
    appStore.notify(t('page.modelProviders.selectTestModelFirst'), 'error')
    return
  }

  appStore.notify(t('page.modelProviders.testing'), 'info')
  
  try {
    const response = await api.testProviderConnection(currentProvider.value.id)

    if (response.success) {
      appStore.notify(t('page.modelProviders.testSuccess'), 'success')
    } else {
      appStore.notify(`${t('page.modelProviders.testFailed')}: ${response.error}`, 'error')
    }
  } catch (error: any) {
    appStore.notify(`${t('page.modelProviders.testFailed')}: ${error.message}`, 'error')
  }
}

function addPreset(preset: PresetProvider) {
  modelProviderStore.addPresetProvider(preset)
  closeModal()
}

function addCustom() {
  if (!isCustomFormValid.value) {
    appStore.notify(t('page.modelProviders.validationFailed'), 'error')
    return
  }
  
  modelProviderStore.addCustomProvider(customName.value, customBaseUrl.value)
  closeModal()
}

function getPresetName(name: string): string {
  const keyMap: Record<string, string> = {
    'MiniMax API': 'page.modelProviders.presets.minimaxApi',
    'OpenAI': 'page.modelProviders.presets.openai',
    'Gemini': 'page.modelProviders.presets.gemini',
    'Claude': 'page.modelProviders.presets.claude'
  }
  const key = keyMap[name]
  return key ? t(key) : name
}
</script>

<style scoped>
.model-providers-view {
  height: 100%;
  overflow: hidden;
}

.providers-layout {
  display: flex;
  gap: 24px;
  height: 100%;
}

.providers-sidebar {
  width: 280px;
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
}

.sidebar-header h3 {
  font-size: 1rem;
  margin: 0;
}

.provider-list {
  flex: 1;
  overflow-y: overlay;
  padding: 8px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.provider-item:hover {
  background: var(--bg-hover);
}

.provider-item.active {
  background: var(--accent-primary);
  color: white;
}

.provider-item.active .provider-type {
  color: rgba(255, 255, 255, 0.7);
}

.provider-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.provider-name {
  font-size: 0.9rem;
  font-weight: 500;
}

.provider-type {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.provider-delete {
  opacity: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.provider-item:hover .provider-delete {
  opacity: 1;
}

.provider-delete:hover {
  background: rgba(255, 255, 255, 0.1);
}

.provider-config {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow-y: overlay;
}

.no-provider {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.config-form {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-info h3 {
  margin: 0;
  font-size: 1.25rem;
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

.form-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.form-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--color-error);
  margin-top: 4px;
}

.input.error {
  border-color: #ef4444;
}

.input.error:focus {
  border-color: #ef4444;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.models-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.model-tag {
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-tag:hover {
  border-color: var(--accent-primary);
}

.model-tag.selected {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.selected-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.selected-model {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.selected-model:hover {
  border-color: var(--accent-primary);
}

.selected-model.default {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.selected-model .filled {
  color: var(--accent-primary);
  fill: var(--accent-primary);
}

.selected-model span {
  flex: 1;
  font-size: 0.875rem;
}

.remove-btn {
  padding: 2px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: var(--bg-hover);
  color: var(--color-error);
}

.no-models {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 8px 0 0;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
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

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.preset-item:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.preset-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preset-name {
  font-weight: 500;
}

.preset-url {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.btn-block {
  width: 100%;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

.custom-item {
  border-style: dashed;
}

.custom-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-icon {
  width: 80px;
  height: 80px;
  opacity: 0.5;
}

.no-provider {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}
</style>
