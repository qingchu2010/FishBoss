<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components'
import { useAppStore } from '@/stores'
import { systemApi } from '@/services'
import { useI18n } from '@/i18n'
import {
  Palette,
  FolderTree,
  Monitor,
  Globe,
  Info,
  FolderSearch,
  Repeat
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t, locale, setLocale } = useI18n()
const storageRoot = ref('')

function toggleLocale() {
  setLocale(locale.value === 'zh_CN' ? 'en' : 'zh_CN')
}

onMounted(async () => {
  const storage = await systemApi.getStorage()
  storageRoot.value = storage.root
})
</script>

<template>
  <div class="settings-view">
    <div class="settings-header">
      <h1>{{ t('nav.settings') }}</h1>
      <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
    </div>

    <div class="settings-grid">
      <Card class="settings-card">
        <CardHeader>
          <div class="card-title-row">
            <div class="card-icon-wrap theme">
              <Palette :size="20" />
            </div>
            <div>
              <CardTitle>{{ t('settings.clientPreferences') }}</CardTitle>
              <CardDescription>{{ t('settings.clientPreferencesHint') }}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent class="settings-section">
          <div class="preference-item">
            <div class="preference-info">
              <Monitor :size="18" />
              <div>
                <span class="preference-label">{{ t('settings.theme') }}</span>
                <span class="preference-value">{{ appStore.theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode') }}</span>
              </div>
            </div>
            <button class="btn btn-secondary" @click="appStore.toggleTheme()">
              <Palette :size="16" />
              {{ t('settings.toggleTheme') }}
            </button>
          </div>

          <div class="preference-item">
            <div class="preference-info">
              <Globe :size="18" />
              <div>
                <span class="preference-label">{{ t('settings.language') }}</span>
                <span class="preference-value">{{ locale === 'zh_CN' ? '中文' : 'English' }}</span>
              </div>
            </div>
            <button class="btn btn-secondary" @click="toggleLocale()">
              <Globe :size="16" />
              {{ locale === 'zh_CN' ? 'EN' : '中文' }}
            </button>
          </div>
          <div class="preference-item">
            <div class="preference-info">
              <FolderSearch :size="18" />
              <div>
                <span class="preference-label">{{ t('settings.toolPathAccess') }}</span>
                <span class="preference-value">
                  {{
                    appStore.allowToolPathsOutsideWorkspace
                      ? t('settings.toolPathAccessAll')
                      : t('settings.toolPathAccessWorkspaceOnly')
                  }}
                </span>
              </div>
            </div>
            <button
              class="btn btn-secondary"
              @click="appStore.setAllowToolPathsOutsideWorkspace(!appStore.allowToolPathsOutsideWorkspace)"
            >
              <FolderSearch :size="16" />
              {{
                appStore.allowToolPathsOutsideWorkspace
                  ? t('settings.limitToolsToWorkspace')
                  : t('settings.allowToolsOutsideWorkspace')
              }}
            </button>
          </div>

          <div class="preference-item">
            <div class="preference-info">
              <Repeat :size="18" />
              <div>
                <span class="preference-label">{{ t('settings.maxToolLoopIterations') }}</span>
                <span class="preference-value">{{ t('settings.maxToolLoopIterationsHint') }}</span>
              </div>
            </div>
            <div class="preference-stepper">
              <template v-if="appStore.toolLoopLimitEnabled">
                <button
                  class="btn btn-secondary stepper-btn"
                  :disabled="appStore.maxToolLoopIterations <= 1"
                  @click="appStore.setMaxToolLoopIterations(appStore.maxToolLoopIterations - 1)"
                >
                  -
                </button>
                <span class="stepper-value">{{ appStore.maxToolLoopIterations }}</span>
                <button
                  class="btn btn-secondary stepper-btn"
                  :disabled="appStore.maxToolLoopIterations >= 32"
                  @click="appStore.setMaxToolLoopIterations(appStore.maxToolLoopIterations + 1)"
                >
                  +
                </button>
              </template>
              <button
                class="toggle-switch"
                :class="{ active: appStore.toolLoopLimitEnabled }"
                @click="appStore.setToolLoopLimitEnabled(!appStore.toolLoopLimitEnabled)"
                :aria-label="appStore.toolLoopLimitEnabled ? t('common.enabled') : t('common.disabled')"
              >
                <span class="toggle-knob" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="settings-card">
        <CardHeader>
          <div class="card-title-row">
            <div class="card-icon-wrap storage">
              <FolderTree :size="20" />
            </div>
            <div>
              <CardTitle>{{ t('settings.backendStorageRoot') }}</CardTitle>
              <CardDescription>{{ t('settings.backendStorageRootHint') }}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="storage-path">
            <code>{{ storageRoot || t('common.loading') }}</code>
          </div>
          <p class="form-hint">
            <Info :size="12" />
            {{ t('settings.storageHint') }}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  overflow-y: overlay;
  padding-bottom: 40px;
}

.settings-header {
  margin-bottom: 28px;
}

.settings-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.settings-subtitle {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
}

.settings-card {
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.card-title-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.card-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.card-icon-wrap.theme {
  background: linear-gradient(135deg, rgba(159, 122, 234, 0.15), rgba(124, 147, 255, 0.15));
  color: #9f7aea;
}

.card-icon-wrap.storage {
  background: linear-gradient(135deg, rgba(72, 187, 120, 0.15), rgba(154, 230, 180, 0.15));
  color: #48bb78;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preference-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.preference-info {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text-secondary);
}

.preference-info > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preference-label {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.preference-value {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.storage-path {
  padding: 16px;
  border-radius: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

code {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-primary);
  word-break: break-all;
}

.form-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 8px 0 0 0;
}

.preference-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.stepper-btn {
  min-width: 32px;
  padding: 4px 8px;
}

.stepper-value {
  min-width: 28px;
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  cursor: pointer;
  background: var(--border-color);
  transition: background 0.2s ease;
  flex-shrink: 0;
  padding: 0;
}

.toggle-switch.active {
  background: #9f7aea;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
  pointer-events: none;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(18px);
}
</style>
