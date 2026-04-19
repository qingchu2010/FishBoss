<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import { Settings, ChevronDown } from 'lucide-vue-next'
import Sidebar from './Sidebar.vue'
import SettingsDrawer from './SettingsDrawer.vue'
import Notification from './Notification.vue'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/i18n'

const route = useRoute()
const appStore = useAppStore()
const { sidebarCollapsed, notifications } = storeToRefs(appStore)
const { t } = useI18n()

const showSettingsDrawer = ref(false)

const pageMeta = computed(() => {
  const map: Record<string, { title: string; subtitle: string }> = {
    '/': { title: t('page.dashboard.title'), subtitle: t('page.dashboard.subtitle') },
    '/chat': { title: t('page.chat.title'), subtitle: t('page.chat.subtitle') },
    '/agents': { title: t('page.agents.title'), subtitle: t('page.agents.subtitle') },
    '/groups': { title: t('page.groups.title'), subtitle: t('page.groups.subtitle') },
    '/media': { title: t('page.media.title'), subtitle: t('page.media.subtitle') },
    '/settings': { title: t('page.settings.title'), subtitle: t('page.settings.subtitle') },
    '/model-providers': { title: t('page.modelProviders.title'), subtitle: t('page.modelProviders.subtitle') },
    '/mcp-servers': { title: t('page.mcpServers.title'), subtitle: t('page.mcpServers.subtitle') },
    '/skills': { title: t('page.skills.title'), subtitle: t('page.skills.subtitle') },
    '/logs': { title: t('page.logs.title'), subtitle: t('page.logs.subtitle') }
  }
  return map[route.path] || { title: t('page.default.title'), subtitle: t('page.default.subtitle') }
})
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <Sidebar />
    <main class="main-content">
      <header class="top-header">
        <div class="header-left">
          <h1 class="page-title">{{ pageMeta.title }}</h1>
          <p class="page-subtitle">{{ pageMeta.subtitle }}</p>
        </div>
        <div class="header-right">
          <button
            type="button"
            class="settings-btn"
            @click="showSettingsDrawer = true"
          >
            <Settings :size="18" />
            <ChevronDown :size="14" class="chevron" :class="{ rotated: showSettingsDrawer }" />
          </button>
          <div class="connection-status connected">
            <span class="status-dot"></span>
            <span class="status-text">{{ t('header.connected') }}</span>
          </div>
        </div>
      </header>
      <div class="content-area">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </Transition>
        </RouterView>
      </div>
    </main>
    
    <SettingsDrawer 
      :is-open="showSettingsDrawer" 
      @close="showSettingsDrawer = false" 
    />
    
    <Teleport to="body">
      <div class="notifications-container">
        <TransitionGroup name="notification-list">
          <Notification
            v-for="notification in notifications"
            :key="notification.id"
            :id="notification.id"
            :message="notification.message"
            :title="notification.title"
            :type="notification.type"
            :duration="notification.duration"
            :show-progress="notification.showProgress"
            @close="appStore.removeNotification"
          />
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.main-content {
  flex: 1;
  margin-left: 260px;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-collapsed .main-content {
  margin-left: 72px;
}

.top-header {
  height: 93px;
  padding: 24px 32px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--header-gradient);
  border-bottom: 1px solid var(--shell-border);
  flex-shrink: 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle {
  margin-top: 8px;
  max-width: 560px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.settings-btn:hover {
  transform: translateY(-1px);
  border-color: var(--border-color-hover);
  background: var(--bg-hover);
}

.settings-btn .chevron {
  transition: transform 0.2s ease;
}

.settings-btn .chevron.rotated {
  transform: rotate(180deg);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-elevated);
  border-radius: 20px;
  font-size: 0.875rem;
  border: 1px solid var(--border-color);
}

.connection-status .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-disconnected);
}

.connection-status.connected .status-dot {
  background: var(--status-connected);
  box-shadow: 0 0 8px var(--status-connected);
}

.connection-status .status-text {
  color: var(--text-secondary);
}

.content-area {
  flex: 1;
  padding: 24px 32px 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.notifications-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column-reverse;
  gap: 12px;
  z-index: 9999;
  pointer-events: none;
}

.notifications-container > * {
  pointer-events: auto;
}

.notification-list-move,
.notification-list-enter-active,
.notification-list-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.notification-list-enter-from,
.notification-list-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-list-leave-active {
  position: absolute;
}
</style>
