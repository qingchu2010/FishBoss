<template>
  <div class="settings-view">
    <h2>{{ t('nav.settings') }}</h2>

    <div class="settings-section card">
      <h3>{{ t('settings.appearance') }}</h3>
      <div class="form-group">
        <label>{{ t('settings.theme') }}</label>
        <CustomSelect
          v-model="theme"
          :options="themeOptions"
        />
      </div>
    </div>

    <div class="settings-section card">
      <h3>{{ t('settings.language') }}</h3>
      <div class="form-group">
        <label>{{ t('settings.language') }}</label>
        <CustomSelect
          v-model="language"
          :options="languageOptions"
        />
      </div>
    </div>

    <div class="settings-section card">
      <h3>{{ t('settings.rateLimit') }}</h3>
      <div class="form-group">
        <label>{{ t('settings.rateLimitEnabled') }}</label>
        <label class="toggle">
          <input type="checkbox" v-model="rateLimit.enabled" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="form-group">
        <label>{{ t('settings.rateLimitWindow') }} (ms)</label>
        <input
          type="number"
          v-model.number="rateLimit.windowMs"
          min="1000"
          step="1000"
          :disabled="!rateLimit.enabled"
        />
      </div>
      <div class="form-group">
        <label>{{ t('settings.rateLimitMax') }}</label>
        <input
          type="number"
          v-model.number="rateLimit.max"
          min="1"
          :disabled="!rateLimit.enabled"
        />
      </div>
      <div class="form-group">
        <label>{{ t('settings.rateLimitChatMax') }}</label>
        <input
          type="number"
          v-model.number="rateLimit.chatMax"
          min="1"
          :disabled="!rateLimit.enabled"
        />
      </div>
      <div class="form-actions">
        <button class="btn-primary" @click="saveRateLimit" :disabled="saving">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
        <span v-if="saveMessage" class="save-message" :class="{ error: saveError }">
          {{ saveMessage }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useI18n } from '@/i18n'
import { api } from '@/services/api'
import CustomSelect from '@/components/CustomSelect.vue'

const appStore = useAppStore()
const { t, setLocale } = useI18n()

const theme = ref(localStorage.getItem('theme') || 'dark')
const language = ref(localStorage.getItem('fishboss-locale') || 'zh_CN')

const rateLimit = ref({
  enabled: true,
  windowMs: 60000,
  max: 100,
  chatMax: 30
})
const saving = ref(false)
const saveMessage = ref('')
const saveError = ref(false)

const themeOptions = computed(() => [
  { value: 'dark', label: t('settings.dark') },
  { value: 'light', label: t('settings.light') }
])

const languageOptions = [
  { value: 'zh_CN', label: '简体中文' },
  { value: 'en', label: 'English' }
]

watch(theme, (val) => {
  appStore.setTheme(val as 'dark' | 'light')
})

watch(language, (val) => {
  setLocale(val as 'zh_CN' | 'en')
})

async function loadRateLimit() {
  try {
    const config = await api.getRateLimitConfig()
    rateLimit.value = {
      enabled: config.enabled ?? true,
      windowMs: config.windowMs ?? 60000,
      max: config.max ?? 100,
      chatMax: config.chatMax ?? 30
    }
  } catch (error) {
    console.error('Failed to load rate limit config:', error)
  }
}

async function saveRateLimit() {
  saving.value = true
  saveMessage.value = ''
  saveError.value = false
  try {
    await api.saveRateLimitConfig(rateLimit.value)
    await api.reloadRateLimitConfig()
    saveMessage.value = t('settings.saveSuccess')
    setTimeout(() => { saveMessage.value = '' }, 3000)
  } catch (error) {
    saveMessage.value = t('settings.saveFailed')
    saveError.value = true
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadRateLimit()
})
</script>

<style scoped>
.settings-view {
  max-width: 600px;
  height: 100%;
  overflow-y: overlay;
}

.settings-view h2 {
  margin-bottom: 24px;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section h3 {
  margin-bottom: 16px;
  font-size: 1rem;
}

.form-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.form-group label:first-child {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.form-group input[type="number"] {
  width: 140px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-group input:disabled {
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

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  transition: 0.3s;
}

.slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .slider {
  background-color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle input:checked + .slider::before {
  transform: translateX(20px);
  background-color: white;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.btn-primary {
  padding: 8px 20px;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-message {
  font-size: 0.85rem;
  color: var(--color-success);
}

.save-message.error {
  color: var(--color-error);
}
</style>
