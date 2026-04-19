<template>
  <Teleport to="body">
    <Transition name="drawer-overlay">
      <div v-if="isOpen" class="drawer-overlay" @click="close"></div>
    </Transition>
    <Transition name="drawer">
      <div v-if="isOpen" class="settings-drawer">
        <div class="drawer-header">
          <h2>{{ t('settings.title') }}</h2>
          <button class="close-btn" @click="close">
            <X :size="20" />
          </button>
        </div>
        
        <div class="drawer-content">
          <div class="setting-section">
            <h3>{{ t('settings.appearance') }}</h3>
            <div class="setting-item">
              <div class="setting-label">
                <component :is="isDark ? MoonStar : SunMedium" :size="18" />
                <span>{{ t('settings.theme') }}</span>
              </div>
              <div class="theme-switch">
                <button
                  :class="{ active: theme === 'light' }"
                  @click="setTheme('light')"
                >
                  <SunMedium :size="14" />
                  {{ t('settings.light') }}
                </button>
                <button
                  :class="{ active: theme === 'dark' }"
                  @click="setTheme('dark')"
                >
                  <MoonStar :size="14" />
                  {{ t('settings.dark') }}
                </button>
              </div>
            </div>
          </div>

          <div class="setting-section">
            <h3>{{ t('settings.language') }}</h3>
            <div class="language-selector">
              <button class="lang-trigger" @click="toggleDropdown">
                <Globe :size="18" />
                <span class="lang-current">{{ currentLanguage?.label }}</span>
                <ChevronDown :size="16" :class="['chevron', { rotated: isDropdownOpen }]" />
              </button>
              <Transition name="dropdown">
                <div v-if="isDropdownOpen" class="lang-dropdown">
                  <button
                    v-for="lang in languages"
                    :key="lang.value"
                    :class="['lang-option', { active: locale === lang.value }]"
                    @click="selectLanguage(lang.value)"
                  >
                    <span class="lang-option-label">{{ lang.label }}</span>
                    <Check v-if="locale === lang.value" :size="16" class="check-icon" />
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { X, SunMedium, MoonStar, Globe, Check, ChevronDown } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useI18n } from '@/i18n'
import { storeToRefs } from 'pinia'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const appStore = useAppStore()
const { theme } = storeToRefs(appStore)
const { t, locale, setLocale } = useI18n()

const isDark = computed(() => theme.value === 'dark')
const isDropdownOpen = ref(false)

const languages = [
  { value: 'zh_CN' as const, label: '简体中文' },
  { value: 'en' as const, label: 'English' }
]

const currentLanguage = computed(() => languages.find(l => l.value === locale.value))

function close() {
  emit('close')
}

function setTheme(newTheme: 'dark' | 'light') {
  appStore.setTheme(newTheme)
}

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}

function selectLanguage(newLocale: 'zh_CN' | 'en') {
  setLocale(newLocale)
  isDropdownOpen.value = false
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 998;
}

.settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  z-index: 999;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.drawer-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  padding: 8px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.setting-section {
  margin-bottom: 32px;
}

.setting-section h3 {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}

.theme-switch {
  display: flex;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  padding: 4px;
  gap: 4px;
}

.theme-switch button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all var(--transition-fast);
}

.theme-switch button.active {
  background: var(--accent-primary);
  color: white;
}

.theme-switch button:hover:not(.active) {
  color: var(--text-primary);
}

.language-selector {
  position: relative;
}

.lang-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.lang-trigger:hover {
  border-color: var(--border-color-hover);
}

.lang-current {
  flex: 1;
  text-align: left;
}

.chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.chevron.rotated {
  transform: rotate(180deg);
}

.lang-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px;
  z-index: 10;
  box-shadow: var(--shadow-md);
}

.lang-option {
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

.lang-option:hover {
  background: var(--bg-hover);
}

.lang-option.active {
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
}

.check-icon {
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

.drawer-overlay-enter-active,
.drawer-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-overlay-enter-from,
.drawer-overlay-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
