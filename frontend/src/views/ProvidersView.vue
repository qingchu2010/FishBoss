<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Check, Cpu, Plus, RefreshCw, Save, Star, Trash2, X, Zap } from 'lucide-vue-next'
import { useAppStore, useProvidersStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getApiErrorMessage } from '@/services/http'
import { providersApi, type CreateProviderData, type Provider, type ProviderModel, type PresetProvider } from '@/services/providers'

const providerStore = useProvidersStore()
const appStore = useAppStore()
const { t } = useI18n()

const showAddModal = ref(false)
const customProvider = ref<CreateProviderData>({
  name: '',
  type: 'custom',
  baseUrl: '',
  apiKey: '',
  models: [],
  enabled: true
})
const editForm = ref({
  name: '',
  type: 'custom' as Provider['type'],
  baseUrl: '',
  apiKey: '',
  enabled: true,
  selectedModel: '',
  customModelId: ''
})
const fetchingModels = ref(false)
const testingReply = ref(false)
const showPresetList = ref(true)
const providerPresets = ref<PresetProvider[]>([])

const providers = computed(() => providerStore.providers)
const currentProvider = computed(() => providerStore.activeProvider)
const availableModels = computed<ProviderModel[]>(() => {
  return currentProvider.value ? (providerStore.providerModels[currentProvider.value.id] ?? []) : []
})

const hasSavedApiKey = computed(() => {
  return Boolean(currentProvider.value?.apiKeyMasked)
})

const isCustomFormValid = computed(() => {
  return customProvider.value.name.trim() !== '' && customProvider.value.type !== undefined
})

const currentProviderPreset = computed(() => {
  if (!currentProvider.value) return null
  return providerPresets.value.find(p => p.name === currentProvider.value?.name) ?? null
})

const supportsModelFetch = computed(() => {
  return currentProviderPreset.value?.supportsModelFetch !== false
})

onMounted(async () => {
  const metadata = await providersApi.metadata()
  providerPresets.value = metadata.presets
  await providerStore.fetchProviders()
  syncEditForm()
  if (currentProvider.value) {
    await providerStore.loadModels(currentProvider.value.id)
  }
})

function syncEditForm() {
  if (!currentProvider.value) {
    editForm.value = {
      name: '',
      type: 'custom',
      baseUrl: '',
      apiKey: '',
      enabled: true,
      selectedModel: '',
      customModelId: ''
    }
    return
  }

  editForm.value = {
    name: currentProvider.value.name,
    type: currentProvider.value.type,
    baseUrl: currentProvider.value.baseUrl ?? '',
    apiKey: '',
    enabled: currentProvider.value.enabled,
    selectedModel: currentProvider.value.models[0] ?? '',
    customModelId: ''
  }
}

async function selectProvider(id: string) {
  providerStore.setActiveProvider(id)
  syncEditForm()
  await providerStore.loadModels(id)
}

async function deleteProvider(id: string) {
  await providerStore.deleteProvider(id)
  syncEditForm()
}

async function addProvider() {
  if (!isCustomFormValid.value) {
    appStore.notify(t('page.modelProviders.validationFailed'), 'error')
    return
  }

  await providerStore.createProvider({
    ...customProvider.value,
    baseUrl: customProvider.value.baseUrl?.trim() || undefined,
    apiKey: customProvider.value.apiKey?.trim() || undefined
  })

  showAddModal.value = false
  customProvider.value = {
    name: '',
    type: 'custom',
    baseUrl: '',
    apiKey: '',
    models: [],
    enabled: true
  }
  syncEditForm()
}

async function addPresetProvider(preset: { name: string; type: Provider['type']; baseUrl?: string; models?: string[] }) {
  const provider = await providerStore.createProvider({
    name: preset.name,
    type: preset.type,
    baseUrl: preset.baseUrl,
    apiKey: '',
    models: [],
    enabled: true,
    defaultModels: preset.models
  })
  showAddModal.value = false
  showPresetList.value = true
  providerStore.setActiveProvider(provider.id)
  await providerStore.loadModels(provider.id)
  syncEditForm()
}

async function saveProvider() {
  if (!currentProvider.value) return
  const currentBaseUrl = currentProvider.value.baseUrl?.trim() ?? ''
  const nextBaseUrl = editForm.value.baseUrl.trim()
  const endpointChanged = currentBaseUrl !== nextBaseUrl || currentProvider.value.type !== editForm.value.type

  if (endpointChanged && hasSavedApiKey.value && !editForm.value.apiKey.trim()) {
    appStore.notify(t('page.modelProviders.reenterApiKeyForEndpointChange'), 'error')
    return
  }

  const updateData: Parameters<typeof providerStore.updateProvider>[1] = {
    name: editForm.value.name.trim(),
    type: editForm.value.type,
    baseUrl: nextBaseUrl || null,
    enabled: editForm.value.enabled,
    models: currentProvider.value.models
  }

  if (editForm.value.apiKey.trim()) {
    updateData.apiKey = editForm.value.apiKey.trim()
  }

  try {
    const provider = await providerStore.updateProvider(currentProvider.value.id, updateData)

    appStore.notify(t('settings.saved'), 'success')
    providerStore.setActiveProvider(provider.id)
    syncEditForm()
  } catch (error) {
    const apiMessage = getApiErrorMessage((error as { response?: { data?: unknown } }).response?.data)
    appStore.notify(apiMessage ?? t('settings.saveFailed'), 'error')
  }
}

async function fetchModels() {
  if (!currentProvider.value) return
  fetchingModels.value = true
  try {
    const result = await providerStore.fetchModels(currentProvider.value.id)
    if (result.error) {
      appStore.notify(`${t('page.modelProviders.fetchFailed')}: ${result.error}`, 'error')
    } else {
      appStore.notify(t('page.modelProviders.modelsFetched'), 'success')
    }
  } catch (error) {
    appStore.notify(`${t('page.modelProviders.fetchFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    fetchingModels.value = false
  }
}

async function addCustomModel() {
  if (!currentProvider.value || !editForm.value.customModelId.trim()) return

  const name = editForm.value.customModelId.trim()
  const model = await providerStore.addCustomModel(currentProvider.value.id, { name })
  await setSelectedModel(model.id)
  editForm.value.customModelId = ''
}

async function setSelectedModel(modelId: string) {
  if (!currentProvider.value) return
  editForm.value.selectedModel = modelId
  if (!currentProvider.value.models.includes(modelId)) {
    await providerStore.updateProvider(currentProvider.value.id, {
      models: [...currentProvider.value.models, modelId]
    })
  }
}

async function removeModel(modelId: string) {
  if (!currentProvider.value) return
  const nextModels = currentProvider.value.models.filter((item) => item !== modelId)
  await providerStore.updateProvider(currentProvider.value.id, { models: nextModels })
  if (editForm.value.selectedModel === modelId) {
    editForm.value.selectedModel = nextModels[0] ?? ''
  }
}

async function testProvider() {
  if (!currentProvider.value || !editForm.value.selectedModel) {
    appStore.notify(t('page.modelProviders.selectTestModelFirst'), 'error')
    return
  }

  testingReply.value = true
  try {
    const result = await providerStore.testProvider({
      providerId: currentProvider.value.id,
      model: editForm.value.selectedModel
    })

    appStore.notify(result.success ? t('page.modelProviders.testSuccess') : `${t('page.modelProviders.testFailed')}: ${result.error ?? 'Unknown error'}`, result.success ? 'success' : 'error')
  } finally {
    testingReply.value = false
  }
}
</script>

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
            v-for="provider in providers"
            :key="provider.id"
            :class="['provider-item', { active: provider.id === providerStore.activeProviderId }]"
            @click="selectProvider(provider.id)"
          >
            <div class="provider-item-info">
              <span class="provider-name">{{ provider.name }}</span>
              <span class="provider-type">{{ t(`page.modelProviders.types.${provider.type}`) }}</span>
            </div>
            <button class="provider-delete" @click.stop="deleteProvider(provider.id)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="provider-config">
          <div v-if="!currentProvider" class="no-provider">
            <div class="empty-icon-wrap"><Cpu :size="28" /></div>
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
              <input v-model="editForm.enabled" type="checkbox" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label class="required">{{ t('page.modelProviders.providerName') }}</label>
            <input v-model="editForm.name" type="text" class="input" :placeholder="t('page.modelProviders.namePlaceholder')" />
          </div>

          <div class="form-group">
            <label class="required">{{ t('page.modelProviders.apiKey') }}</label>
            <input
              v-model="editForm.apiKey"
              type="password"
              class="input"
              :placeholder="hasSavedApiKey ? t('page.modelProviders.apiKeyPlaceholderNew') : t('page.modelProviders.apiKeyPlaceholder')"
            />
            <span v-if="hasSavedApiKey" class="form-hint">
              <Check :size="12" />
              {{ t('page.modelProviders.apiKeySaved') }}
            </span>
          </div>

          <div class="form-group">
            <label>{{ t('page.modelProviders.baseUrl') }}</label>
            <input v-model="editForm.baseUrl" type="text" class="input" :placeholder="t('page.modelProviders.baseUrlPlaceholder')" />
            <span class="form-hint">
              <AlertCircle :size="12" />
              {{ t('page.modelProviders.baseUrlHint') }}
            </span>
            <span class="form-hint">
              <Check :size="12" />
              {{ t('page.modelProviders.autoProtocolHint') }}
            </span>
            <span v-if="currentProvider.protocol" class="form-hint">
              <Cpu :size="12" />
              {{ t('page.modelProviders.protocolDetected') }}: {{ currentProvider.protocol }}
            </span>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label>{{ t('page.modelProviders.availableModels') }}</label>
              <button v-if="supportsModelFetch" class="btn btn-sm btn-secondary" @click="fetchModels" :disabled="fetchingModels">
                <RefreshCw :size="14" :class="{ spin: fetchingModels }" />
                {{ fetchingModels ? t('page.modelProviders.fetching') : t('page.modelProviders.fetchModels') }}
              </button>
            </div>

            <div class="models-list" v-if="availableModels.length > 0">
              <span
                v-for="model in availableModels"
                :key="model.id"
                :class="['model-tag', { selected: currentProvider.models.includes(model.id) }]"
                @click="setSelectedModel(model.id)"
              >
                {{ model.name || model.id }}
              </span>
            </div>
            <p v-else class="no-models">{{ t('page.modelProviders.noModels') }}</p>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label>{{ t('page.modelProviders.selectedModels') }}</label>
              <button class="btn btn-sm btn-ghost" @click="addCustomModel">
                <Plus :size="14" />
                {{ t('common.add') }}
              </button>
            </div>

            <div class="custom-model-input">
              <input v-model="editForm.customModelId" type="text" class="input" :placeholder="t('page.modelProviders.modelIdPlaceholder')" @keyup.enter="addCustomModel" />
            </div>

            <div class="selected-models" v-if="currentProvider.models.length > 0">
              <div
                v-for="model in currentProvider.models"
                :key="model"
                :class="['selected-model', { default: model === editForm.selectedModel }]"
                @click="setSelectedModel(model)"
              >
                <Star :size="12" :class="{ filled: model === editForm.selectedModel }" />
                <span>{{ model }}</span>
                <button class="remove-btn" @click.stop="removeModel(model)">
                  <X :size="14" />
                </button>
              </div>
            </div>
            <p v-else class="no-models">{{ t('page.modelProviders.noSelectedModels') }}</p>
          </div>

          <div class="form-actions">
            <button class="btn btn-secondary" @click="testProvider" :disabled="testingReply || !editForm.selectedModel">
              <Zap :size="16" />
              {{ testingReply ? t('page.modelProviders.testing') : t('page.modelProviders.testReply') }}
            </button>
            <button class="btn btn-primary" @click="saveProvider">
              <Save :size="16" />
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ showPresetList ? t('page.modelProviders.addProvider') : t('page.modelProviders.addCustomProvider') }}</h3>
            <button class="modal-close" @click="showAddModal = false">
              <X :size="20" />
            </button>
          </div>

          <div v-if="showPresetList" class="modal-body">
            <div class="preset-list">
              <div
                v-for="preset in providerPresets"
                :key="preset.name"
                class="preset-item"
                @click="addPresetProvider(preset)"
              >
                <div class="preset-icon">
                  <Cpu :size="20" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ preset.name }}</span>
                  <span class="preset-url">{{ preset.baseUrl }}</span>
                </div>
              </div>

              <div class="divider">
                <span>{{ t('page.modelProviders.orCustom') }}</span>
              </div>

              <div class="preset-item custom-item" @click="showPresetList = false">
                <div class="preset-icon">
                  <Plus :size="20" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ t('page.modelProviders.customProvider') }}</span>
                  <span class="preset-url">{{ t('page.modelProviders.customProviderHint') }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="modal-body custom-form">
            <div class="form-group">
              <label class="required">{{ t('page.modelProviders.providerName') }}</label>
              <input v-model="customProvider.name" type="text" class="input" :placeholder="t('page.modelProviders.namePlaceholder')" />
            </div>

            <div class="form-group">
              <label class="required">{{ t('page.modelProviders.baseUrl') }}</label>
              <input v-model="customProvider.baseUrl" type="text" class="input" :placeholder="t('page.modelProviders.baseUrlPlaceholder')" />
            </div>

            <div class="form-group">
              <label>{{ t('page.modelProviders.apiKey') }}</label>
              <input v-model="customProvider.apiKey" type="password" class="input" :placeholder="t('page.modelProviders.apiKeyPlaceholder')" />
            </div>

            <div class="form-actions">
              <button class="btn btn-secondary" @click="showPresetList = true">{{ t('common.cancel') }}</button>
              <button class="btn btn-primary" @click="addProvider" :disabled="!isCustomFormValid">{{ t('page.modelProviders.addCustom') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.model-providers-view {
  height: 100%;
}

.providers-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
  height: 100%;
}

.providers-sidebar,
.provider-config {
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.providers-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 680px;
}

.sidebar-header,
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.provider-list {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.provider-item:hover {
  background: var(--bg-hover);
}

.provider-item.active {
  background: var(--accent-soft-gradient);
  border-color: var(--accent-border);
}

.provider-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-name {
  font-weight: 600;
  color: var(--text-primary);
}

.provider-type {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.provider-delete,
.modal-close,
.remove-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.config-form,
.custom-form {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.config-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.no-provider {
  min-height: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
  font-weight: 700;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.required::after {
  content: ' *';
  color: var(--color-error);
}

.models-list,
.selected-models {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.model-tag,
.selected-model {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.model-tag.selected,
.selected-model.default {
  border-color: var(--accent-border);
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
}

.selected-model .filled {
  fill: var(--accent-primary);
  color: var(--accent-primary);
}

.custom-model-input {
  display: flex;
  gap: 12px;
}

.test-result {
  min-height: 120px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.form-hint,
.no-models {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.toggle {
  position: relative;
  display: inline-flex;
}

.toggle input {
  display: none;
}

.toggle-slider {
  width: 44px;
  height: 24px;
  background: var(--bg-secondary);
  border-radius: 999px;
  border: 1px solid var(--border-color);
  position: relative;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform 0.2s ease;
}

.toggle input:checked + .toggle-slider::after {
  transform: translateX(20px);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(9, 11, 20, 0.56);
  display: grid;
  place-items: center;
  z-index: 1000;
}

.modal {
  width: min(540px, calc(100vw - 32px));
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-body {
  padding: 20px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.preset-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preset-name {
  font-weight: 600;
  color: var(--text-primary);
}

.preset-url {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  padding: 4px 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
