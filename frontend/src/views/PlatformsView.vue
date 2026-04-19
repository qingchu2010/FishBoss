<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Globe, Plus, RefreshCw, Save, Send, Trash2, X, Zap } from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { useI18n } from '@/i18n'
import { AppSelect } from '@/components'
import {
  platformsApi,
  type Platform,
  type PlatformDetail,
  type PlatformMetadata,
  type PlatformModuleDefinition
} from '@/services/platforms'

const appStore = useAppStore()
const { t } = useI18n()

const platforms = ref<Platform[]>([])
const platformDetails = ref<Map<string, PlatformDetail>>(new Map())
const activePlatformId = ref<string | null>(null)
const showAddModal = ref(false)
const showSendModal = ref(false)
const loading = ref(false)
const saving = ref(false)
const sending = ref(false)
const metadata = ref<{ platformTypes: PlatformMetadata[] }>({ platformTypes: [] })

const editForm = ref({
  name: '',
  platformType: '' as Platform['platformType'],
  config: {} as Record<string, unknown>,
  enabled: true
})

const sendForm = ref({
  targetId: '',
  msgType: 0,
  content: ''
})

const msgTypeOptions = [
  { value: 0, label: 'page.platforms.msgTypes.text' },
  { value: 2, label: 'page.platforms.msgTypes.markdown' },
  { value: 3, label: 'page.platforms.msgTypes.ark' },
  { value: 7, label: 'page.platforms.msgTypes.media' }
]

const localizedMsgTypeOptions = computed(() =>
  msgTypeOptions.map((option) => ({ value: option.value, label: t(option.label) }))
)

const currentPlatform = computed(() => platforms.value.find((platform) => platform.id === activePlatformId.value) ?? null)
const currentDetail = computed(() => activePlatformId.value ? platformDetails.value.get(activePlatformId.value) ?? null : null)
const currentPlatformMetadata = computed(() => {
  if (!currentPlatform.value) return null
  return metadata.value.platformTypes.find((platform) => platform.type === currentPlatform.value?.platformType) ?? null
})
const currentEnabledModules = computed(() => {
  if (!currentPlatformMetadata.value) return []
  return currentPlatformMetadata.value.modules.filter((module) => isModuleEnabled(editForm.value.config, module))
})
const currentSupportsMessaging = computed(() => {
  if (!currentPlatformMetadata.value) return false
  return currentPlatformMetadata.value.modules.some((module) => isModuleEnabled(editForm.value.config, module) && module.capabilities.supportsMessaging)
})
const currentSupportsConnectionTest = computed(() => {
  if (!currentPlatformMetadata.value) return false
  return currentPlatformMetadata.value.modules.some((module) => isModuleEnabled(editForm.value.config, module) && module.capabilities.supportsConnectionTest)
})
const isSendFormValid = computed(() => sendForm.value.targetId.trim() !== '' && sendForm.value.content.trim() !== '')
const currentPlatformIsQQ = computed(() => currentPlatform.value?.platformType === 'qq')

onMounted(async () => {
  await loadMetadata()
  await loadPlatforms()
})

function cloneConfig(config: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>
}

function normalizeDefaultConfig(platformMetadata: PlatformMetadata | null) {
  if (!platformMetadata) return {}
  return cloneConfig(platformMetadata.defaultConfig)
}

function platformDisplayName(type: string) {
  const platform = metadata.value.platformTypes.find((item) => item.type === type)
  return platform?.displayName ?? type
}

function moduleSummary(platformMetadata: PlatformMetadata) {
  return platformMetadata.modules.map((module) => module.title).join(' / ')
}

function openAddModal() {
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
}

function moduleConfig(config: Record<string, unknown>, moduleId: string) {
  const value = config[moduleId]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function isModuleEnabled(config: Record<string, unknown>, module: PlatformModuleDefinition) {
  const value = moduleConfig(config, module.id).enabled
  if (typeof value === 'boolean') {
    return value
  }
  return module.enabledByDefault ?? false
}

function setModuleEnabled(target: typeof editForm.value, module: PlatformModuleDefinition, enabled: boolean) {
  const nextConfig = cloneConfig(target.config)
  const current = moduleConfig(nextConfig, module.id)
  nextConfig[module.id] = {
    ...current,
    enabled
  }
  target.config = nextConfig
}

function updateModuleField(
  target: typeof editForm.value,
  module: PlatformModuleDefinition,
  fieldKey: string,
  value: string
) {
  const nextConfig = cloneConfig(target.config)
  const current = moduleConfig(nextConfig, module.id)
  nextConfig[module.id] = {
    ...current,
    enabled: isModuleEnabled(nextConfig, module),
    [fieldKey]: value
  }
  target.config = nextConfig
}

function getModuleFieldValue(config: Record<string, unknown>, module: PlatformModuleDefinition, fieldKey: string) {
  const value = moduleConfig(config, module.id)[fieldKey]
  return typeof value === 'string' ? value : ''
}



async function loadMetadata() {
  try {
    metadata.value = await platformsApi.getMetadata()
  } catch (error) {
    console.error('Failed to load platform metadata:', error)
  }
}

async function loadPlatforms() {
  loading.value = true
  try {
    platforms.value = await platformsApi.list()
    if (platforms.value.length > 0) {
      const nextId = platforms.value.find((platform) => platform.id === activePlatformId.value)?.id ?? platforms.value[0].id
      await selectPlatform(nextId)
    } else {
      activePlatformId.value = null
      syncEditForm()
    }
  } catch (error) {
    console.error('Failed to load platforms:', error)
    appStore.notify(t('page.platforms.loadFailed'), 'error')
  } finally {
    loading.value = false
  }
}

async function selectPlatform(id: string) {
  activePlatformId.value = id
  syncEditForm()
  await loadPlatformDetail(id)
}

async function loadPlatformDetail(id: string) {
  try {
    const detail = await platformsApi.get(id)
    if (detail) {
      platformDetails.value.set(id, detail)
    }
  } catch (error) {
    console.error('Failed to load platform detail:', error)
  }
}

function syncEditForm() {
  if (!currentPlatform.value) {
    const firstPlatformType = metadata.value.platformTypes[0]?.type ?? ''
    editForm.value = {
      name: '',
      platformType: firstPlatformType,
      config: normalizeDefaultConfig(metadata.value.platformTypes[0] ?? null),
      enabled: true
    }
    return
  }

  editForm.value = {
    name: currentPlatform.value.name,
    platformType: currentPlatform.value.platformType,
    config: cloneConfig(currentPlatform.value.config),
    enabled: currentPlatform.value.enabled
  }
}

function generatePlatformName(displayName: string, platformType: string): string {
  const existing = platforms.value.filter((p) => p.platformType === platformType)
  if (existing.length === 0) return displayName
  return `${displayName} ${existing.length + 1}`
}

async function addPresetPlatform(platformType: Platform['platformType'], displayName: string) {
  const platformMeta = metadata.value.platformTypes.find((p) => p.type === platformType) ?? null
  const name = generatePlatformName(displayName, platformType)
  const config = normalizeDefaultConfig(platformMeta)

  if (platformType === 'qq') {
    config.qqOpenPlatform = { ...(config.qqOpenPlatform as Record<string, unknown> ?? {}), enabled: false }
  }

  saving.value = true
  try {
    const platform = await platformsApi.create({
      name,
      platformType,
      config,
      enabled: true
    })

    platforms.value = [...platforms.value, platform]
    closeAddModal()
    await selectPlatform(platform.id)
    appStore.notify(t('page.platforms.created'), 'success')
  } catch (error) {
    console.error('Failed to create platform:', error)
    appStore.notify(t('page.platforms.createFailed'), 'error')
  } finally {
    saving.value = false
  }
}

async function updatePlatform() {
  if (!currentPlatform.value) return

  saving.value = true
  try {
    const updated = await platformsApi.update(currentPlatform.value.id, {
      name: editForm.value.name.trim(),
      config: cloneConfig(editForm.value.config),
      enabled: editForm.value.enabled
    })

    const index = platforms.value.findIndex((platform) => platform.id === updated.id)
    if (index !== -1) {
      platforms.value[index] = updated
    }
    syncEditForm()
    await loadPlatformDetail(updated.id)
    appStore.notify(t('page.platforms.updated'), 'success')
  } catch (error) {
    console.error('Failed to update platform:', error)
    appStore.notify(t('page.platforms.updateFailed'), 'error')
  } finally {
    saving.value = false
  }
}

async function deletePlatform(id: string) {
  try {
    await platformsApi.delete(id)
    platforms.value = platforms.value.filter((platform) => platform.id !== id)
    platformDetails.value.delete(id)
    if (activePlatformId.value === id) {
      const nextId = platforms.value[0]?.id ?? null
      activePlatformId.value = nextId
      if (nextId) {
        await selectPlatform(nextId)
      } else {
        syncEditForm()
      }
    }
    appStore.notify(t('page.platforms.deleted'), 'success')
  } catch (error) {
    console.error('Failed to delete platform:', error)
    appStore.notify(t('page.platforms.deleteFailed'), 'error')
  }
}

async function testPlatform() {
  if (!currentPlatform.value) return

  try {
    const result = await platformsApi.testConnection(currentPlatform.value.id)
    if (result.success) {
      appStore.notify(t('page.platforms.testSuccess'), 'success')
    } else {
      appStore.notify(`${t('page.platforms.testFailed')}: ${result.error}`, 'error')
    }
    await loadPlatformDetail(currentPlatform.value.id)
  } catch (error) {
    console.error('Failed to test platform:', error)
    appStore.notify(t('page.platforms.testFailed'), 'error')
  }
}

async function sendMessage() {
  if (!currentPlatform.value || !isSendFormValid.value) return

  sending.value = true
  try {
    await platformsApi.sendMessage(currentPlatform.value.id, sendForm.value.targetId, {
      content: sendForm.value.content,
      ...(currentPlatformIsQQ.value ? { msg_type: sendForm.value.msgType } : {})
    })
    appStore.notify(t('page.platforms.messageSent'), 'success')
    showSendModal.value = false
    sendForm.value = { targetId: '', msgType: 0, content: '' }
  } catch (error) {
    console.error('Failed to send platform message:', error)
    appStore.notify(t('page.platforms.sendFailed'), 'error')
  } finally {
    sending.value = false
  }
}

function openSendModal() {
  sendForm.value = {
    targetId: '',
    msgType: 0,
    content: ''
  }
  showSendModal.value = true
}
</script>

<template>
  <div class="platforms-view">
    <div class="platforms-layout">
      <div class="platforms-sidebar">
        <div class="sidebar-header">
          <h3>{{ t('page.platforms.myPlatforms') }}</h3>
          <button class="btn btn-sm btn-secondary" @click="openAddModal">
            <Plus :size="16" />
            {{ t('page.platforms.add') }}
          </button>
        </div>

        <div class="platform-list scrollbar">
          <div
            v-for="platform in platforms"
            :key="platform.id"
            :class="['platform-item', { active: platform.id === activePlatformId }]"
            @click="selectPlatform(platform.id)"
          >
            <div class="platform-item-info">
              <span class="platform-name">{{ platform.name }}</span>
              <span class="platform-type">{{ platformDisplayName(platform.platformType) }}</span>
            </div>
            <button class="platform-delete" @click.stop="deletePlatform(platform.id)">
              <Trash2 :size="14" />
            </button>
          </div>

          <div v-if="platforms.length === 0 && !loading" class="no-platforms">
            <p>{{ t('page.platforms.noPlatforms') }}</p>
          </div>
        </div>
      </div>

      <div class="platform-config">
        <div v-if="!currentPlatform && !loading" class="no-platform">
          <div class="empty-icon-wrap"><Globe :size="28" /></div>
          <p>{{ t('page.platforms.noPlatformSelected') }}</p>
          <button class="btn btn-primary" @click="openAddModal">
            <Plus :size="16" />
            {{ t('page.platforms.addFirst') }}
          </button>
        </div>

        <div v-else-if="loading" class="loading-platform">
          <RefreshCw :size="24" class="spin" />
        </div>

        <Transition name="panel-fade" mode="out-in">
          <div v-if="currentPlatform" :key="currentPlatform.id" class="config-form">
            <div class="config-header">
              <div class="config-info">
                <h3>{{ currentPlatform?.name }}</h3>
                <span :class="['badge', currentPlatform?.enabled ? 'badge-info' : 'badge-secondary']">
                  {{ currentPlatform?.enabled ? t('common.enabled') : t('common.disabled') }}
                </span>
                <span
                  v-if="currentDetail?.connectionStatus"
                  :class="['badge', currentDetail.connectionStatus.success ? 'badge-info' : 'badge-secondary']"
                >
                  {{ currentDetail.connectionStatus.success ? t('page.platforms.connected') : t('page.platforms.disconnected') }}
                </span>
              </div>
              <label class="toggle">
                <input v-model="editForm.enabled" type="checkbox" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="form-group">
              <label class="required">{{ t('page.platforms.name') }}</label>
              <input v-model="editForm.name" type="text" class="input" :placeholder="t('page.platforms.namePlaceholder')" />
            </div>

            <div class="form-group">
              <label>{{ t('page.platforms.platformType') }}</label>
              <div class="platform-type-display">
                <span class="platform-type-pill">{{ platformDisplayName(editForm.platformType) }}</span>
                <span v-if="currentEnabledModules.length > 0" class="platform-type-meta">
                  {{ currentEnabledModules.map((module) => module.title).join(' / ') }}
                </span>
              </div>
            </div>

            <div v-if="currentPlatformMetadata" class="module-list">
              <div v-for="module in currentPlatformMetadata.modules" :key="module.id" class="module-card">
                <div class="module-header">
                  <div class="module-header-main">
                    <div class="module-title-row">
                      <h4>{{ module.title }}</h4>
                      <div class="module-capabilities">
                        <span v-if="module.capabilities.supportsConnectionTest" class="module-capability">
                          {{ t('page.platforms.test') }}
                        </span>
                        <span v-if="module.capabilities.supportsMessaging" class="module-capability">
                          {{ t('page.platforms.sendMessage') }}
                        </span>
                      </div>
                    </div>
                    <p>{{ module.description }}</p>
                  </div>
                  <label class="toggle">
                    <input
                      :checked="isModuleEnabled(editForm.config, module)"
                      type="checkbox"
                      @change="setModuleEnabled(editForm, module, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <Transition name="module-expand">
                  <div v-if="isModuleEnabled(editForm.config, module)" class="module-fields">
                    <label v-for="field in module.fields" :key="field.key" class="field-block">
                      <span>{{ field.label }}</span>

                      <AppSelect
                        v-if="field.type === 'select'"
                        :options="field.options ?? []"
                        :model-value="getModuleFieldValue(editForm.config, module, field.key)"
                        @update:modelValue="(value) => updateModuleField(editForm, module, field.key, String(value))"
                      />

                      <input
                        v-else
                        class="input"
                        :type="field.type"
                        :placeholder="field.placeholder ?? ''"
                        :value="getModuleFieldValue(editForm.config, module, field.key)"
                        @input="updateModuleField(editForm, module, field.key, ($event.target as HTMLInputElement).value)"
                      />
                    </label>
                  </div>
                </Transition>
              </div>
            </div>

            <div class="form-actions">
              <button v-if="currentSupportsConnectionTest" class="btn btn-secondary" @click="testPlatform">
                <Zap :size="16" />
                {{ t('page.platforms.test') }}
              </button>
              <button v-if="currentSupportsMessaging" class="btn btn-secondary" @click="openSendModal">
                <Send :size="16" />
                {{ t('page.platforms.sendMessage') }}
              </button>
              <button class="btn btn-primary" @click="updatePlatform" :disabled="saving">
                <Save :size="16" />
                {{ saving ? t('common.saving') : t('common.save') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ t('page.platforms.add') }}</h3>
            <button class="modal-close" @click="closeAddModal">
              <X :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <div class="preset-list">
              <div
                v-for="platform in metadata.platformTypes"
                :key="platform.type"
                class="preset-item"
                @click="addPresetPlatform(platform.type, platform.displayName)"
              >
                <div class="preset-icon">
                  <Globe :size="20" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ platform.displayName }}</span>
                  <span class="preset-url">{{ moduleSummary(platform) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showSendModal" class="modal-overlay" @click.self="showSendModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ t('page.platforms.sendMessage') }}</h3>
            <button class="modal-close" @click="showSendModal = false">
              <X :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="required">{{ t('page.platforms.targetId') }}</label>
              <input v-model="sendForm.targetId" type="text" class="input" :placeholder="t('page.platforms.targetIdPlaceholder')" />
            </div>

            <div v-if="currentPlatformIsQQ" class="form-group">
              <label>{{ t('page.platforms.msgType') }}</label>
              <AppSelect
                v-model="sendForm.msgType"
                :options="localizedMsgTypeOptions"
              />
            </div>

            <div class="form-group">
              <label class="required">{{ t('page.platforms.content') }}</label>
              <textarea v-model="sendForm.content" class="input textarea" :placeholder="t('page.platforms.contentPlaceholder')" rows="4"></textarea>
            </div>

            <div class="form-actions">
              <button class="btn btn-secondary" @click="showSendModal = false">{{ t('common.cancel') }}</button>
              <button class="btn btn-primary" @click="sendMessage" :disabled="!isSendFormValid || sending">
                {{ sending ? t('page.platforms.sending') : t('page.platforms.send') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.platforms-view {
  height: 100%;
}

.platforms-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
  height: 100%;
}

.platforms-sidebar,
.platform-config {
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.platforms-sidebar {
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

.platform-list {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.platform-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.platform-item:hover {
  background: var(--bg-hover);
}

.platform-item.active {
  background: var(--accent-soft-gradient);
  border-color: var(--accent-border);
}

.platform-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.platform-name {
  font-weight: 600;
  color: var(--text-primary);
}

.platform-type {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.platform-delete,
.modal-close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.config-form {
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

.no-platform,
.no-platforms {
  min-height: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
}

.loading-platform {
  min-height: 640px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.platform-type-display {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.platform-type-pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
  font-weight: 600;
}

.platform-type-meta {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.required::after {
  content: ' *';
  color: var(--color-error);
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.module-card {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.module-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.module-header-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.module-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.module-header h4 {
  margin: 0;
  color: var(--text-primary);
}

.module-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.module-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.module-capability {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.module-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: var(--bg-secondary);
}

.field-block span {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
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
  background: var(--bg-card);
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
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
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
  min-width: 0;
}

.preset-name {
  font-weight: 600;
  color: var(--text-primary);
}

.preset-url {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.textarea {
  resize: vertical;
  min-height: 100px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Module expansion transition */
.module-expand-enter-active,
.module-expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.module-expand-enter-from,
.module-expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
}

.module-expand-enter-to,
.module-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* Panel fade transition */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Module card hover enhancement */
.module-card {
  transition: all 0.2s ease;
}

.module-card:hover {
  border-color: var(--border-color-hover);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

/* Platform item selection transition */
.platform-item {
  transition: all 0.2s ease;
}

.platform-item.active {
  background: var(--accent-soft-gradient);
  border-color: var(--accent-border);
  transform: scale(1.01);
}

/* Preset item hover enhancement */
.preset-item {
  transition: all 0.2s ease;
}

.preset-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
  transform: translateX(4px);
}
</style>
