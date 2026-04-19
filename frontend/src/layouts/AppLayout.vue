<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import { Settings, ChevronDown } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import AppSidebar from '@/components/AppSidebar.vue'
import AppSettingsDrawer from '@/components/AppSettingsDrawer.vue'
import AppNotification from '@/components/AppNotification.vue'
import { useAppStore, useAuthStore } from '@/stores'
import { useI18n } from '@/i18n'

const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()
const { sidebarCollapsed, notifications } = storeToRefs(appStore)
const { t } = useI18n()

const showSettingsDrawer = ref(false)
const isConversationRoute = computed(() => route.path === '/conversations' || route.path.startsWith('/conversations/'))
const pageTransitionName = computed(() => 'page-fade')
const pageTransitionMode = 'out-in' as const
const routeViewKey = computed(() => isConversationRoute.value ? '/conversations' : route.fullPath)

const pageMeta = computed(() => {
  const map: Record<string, { title: string; subtitle: string }> = {
    '/dashboard': { title: t('page.dashboard.title'), subtitle: t('page.dashboard.subtitle') },
    '/conversations': { title: t('page.chat.title'), subtitle: t('page.chat.subtitle') },
    '/agents': { title: t('page.agents.title'), subtitle: t('page.agents.subtitle') },
    '/settings': { title: t('page.settings.title'), subtitle: t('page.settings.subtitle') },
    '/providers': { title: t('page.modelProviders.title'), subtitle: t('page.modelProviders.subtitle') },
    '/mcp': { title: t('page.mcpServers.title'), subtitle: t('page.mcpServers.subtitle') },
    '/skills': { title: t('page.skills.title'), subtitle: t('page.skills.subtitle') },
    '/logs': { title: t('page.logs.title'), subtitle: t('page.logs.subtitle') },
    '/workflows': { title: t('page.default.title'), subtitle: t('page.default.subtitle') }
  }

  if (route.path.startsWith('/conversations/')) {
    return { title: t('page.chat.title'), subtitle: t('page.chat.subtitle') }
  }

  if (route.path.startsWith('/agents/')) {
    return { title: t('page.agents.title'), subtitle: t('page.agents.subtitle') }
  }

  return map[route.path] || { title: t('page.default.title'), subtitle: t('page.default.subtitle') }
})

const connectionText = computed(() => {
  return authStore.isAuthenticated ? t('header.connected') : t('header.disconnected')
})
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar />
    <main class="main-content">
      <header class="top-header">
        <div class="header-left">
          <h1 class="page-title">{{ pageMeta.title }}</h1>
          <p class="page-subtitle">{{ pageMeta.subtitle }}</p>
        </div>
        <div class="header-right">
          <button type="button" class="settings-btn" @click="showSettingsDrawer = true">
            <Settings :size="18" />
            <ChevronDown :size="14" class="chevron" :class="{ rotated: showSettingsDrawer }" />
          </button>
          <div class="connection-status" :class="{ connected: authStore.isAuthenticated }">
            <span class="status-dot"></span>
            <span class="status-text">{{ connectionText }}</span>
          </div>
        </div>
      </header>

      <div class="content-area" :class="{ 'content-area-conversation': isConversationRoute }">
        <RouterView v-slot="{ Component }">
          <div class="route-host">
            <Transition :name="pageTransitionName" :mode="pageTransitionMode">
              <component :is="Component" :key="routeViewKey" class="route-page" />
            </Transition>
          </div>
        </RouterView>
      </div>
    </main>

    <AppSettingsDrawer :is-open="showSettingsDrawer" @close="showSettingsDrawer = false" />

    <Teleport to="body">
      <div class="notifications-container">
        <TransitionGroup name="notification-list">
          <AppNotification
            v-for="notification in notifications"
            :key="notification.id"
            v-bind="notification"
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
  color: var(--text-secondary);
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
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.content-area.content-area-conversation {
  overflow: hidden;
}

.route-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.route-page {
  flex: 1;
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
