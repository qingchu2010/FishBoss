<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  MessageSquareText,
  Bot,
  Boxes,
  Cable,
  ChevronLeft,
  Database,
  Puzzle,
  RadioTower,
  ScrollText,
  Users,
  Settings
} from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { ROUTES } from '@/config'
import { useI18n } from '@/i18n'
import AppLogo from '@/assets/logo/AppLogo.vue'

const LAST_CONVERSATION_ROUTE_KEY = 'fishboss:last-conversation-route'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t } = useI18n()

const navItems = computed(() => [
  { path: ROUTES.DASHBOARD, label: t('nav.dashboard'), icon: LayoutDashboard },
  { path: ROUTES.CONVERSATIONS, label: t('nav.chat'), icon: MessageSquareText },
  { path: ROUTES.AGENTS, label: t('nav.agents'), icon: Bot },
  { path: ROUTES.WORKFLOWS, label: t('nav.workflows'), icon: Boxes },
  { path: ROUTES.PLATFORMS, label: t('nav.platforms'), icon: Cable },
  { path: ROUTES.GROUPS, label: t('nav.groups'), icon: Users },
  { path: ROUTES.DATABASE, label: t('nav.database'), icon: Database },
  { path: ROUTES.PROVIDERS, label: t('nav.modelProviders'), icon: Bot },
  { path: ROUTES.MCP, label: t('nav.mcpServers'), icon: RadioTower },
  { path: ROUTES.SKILLS, label: t('nav.skills'), icon: Puzzle },
  { path: ROUTES.LOGS, label: t('nav.logs'), icon: ScrollText },
  { path: ROUTES.SETTINGS, label: t('nav.settings'), icon: Settings }
])

const isActive = (path: string) => {
  if (path === '/conversations' && route.path.startsWith('/conversations')) return true
  return route.path === path
}

function navigate(path: string) {
  if (path !== ROUTES.CONVERSATIONS) {
    if (route.path === path) {
      return
    }
    router.push(path)
    return
  }

  const lastConversationRoute = window.sessionStorage.getItem(LAST_CONVERSATION_ROUTE_KEY)
  const lastConversationId = lastConversationRoute?.split('/').pop()
  if (lastConversationRoute && lastConversationId) {
    if (route.fullPath === lastConversationRoute) {
      return
    }
    router.push(lastConversationRoute)
    return
  }

  if (route.path === path) {
    return
  }
  router.push(path)
}
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-icon"><AppLogo /></span>
        <div class="logo-copy" v-show="!appStore.sidebarCollapsed">
          <span class="logo-text">{{ t('app.name') }}</span>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <ul class="nav-list">
        <li v-for="item in navItems" :key="item.path">
          <button
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            type="button"
            @click="navigate(item.path)"
            :title="appStore.sidebarCollapsed ? item.label : ''"
          >
            <component :is="item.icon" :size="18" class="nav-icon" />
            <span class="nav-label">{{ item.label }}</span>
            <span class="active-indicator" v-if="isActive(item.path)"></span>
          </button>
        </li>
      </ul>
    </nav>

    <div class="sidebar-footer">
      <button type="button" class="collapse-btn" @click="appStore.toggleSidebar">
        <span class="collapse-icon" :class="{ rotated: appStore.sidebarCollapsed }">
          <ChevronLeft :size="14" />
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--sidebar-gradient);
  border-right: 1px solid var(--shell-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}

.app-sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-header {
  padding: 24px 18px;
  border-bottom: 1px solid var(--shell-border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.logo-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--accent-soft-gradient);
  border: 1px solid var(--accent-border);
  box-shadow: inset 0 1px 0 var(--logo-highlight);
}

.logo-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logo-text {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  transition: opacity 0.3s, width 0.3s;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 12px;
  overflow-y: auto;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
}

.nav-item:hover {
  background: var(--bg-hover);
  border-color: var(--shell-border);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
  border-color: var(--accent-border);
  box-shadow: inset 0 1px 0 var(--logo-highlight), 0 12px 26px var(--accent-soft-shadow);
}

.nav-item.active .nav-icon {
  transform: scale(1.1);
}

.nav-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.nav-label {
  white-space: nowrap;
  transition: opacity 0.3s, width 0.3s;
}

.active-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 24px;
  background: var(--accent-primary);
  border-radius: 3px 0 0 3px;
  box-shadow: 0 0 12px var(--accent-primary);
}

.collapsed .logo-text,
.collapsed .nav-label {
  opacity: 0;
  width: 0;
}

.collapsed .nav-item {
  justify-content: center;
  padding: 14px;
}

.sidebar-footer {
  padding: 16px 12px;
  border-top: 1px solid var(--shell-border);
}

.collapse-btn {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.collapse-icon {
  font-size: 0.75rem;
  transition: transform 0.3s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}
</style>
