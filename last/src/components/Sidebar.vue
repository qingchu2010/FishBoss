<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import {
  Bot,
  Boxes,
  Cable,
  FolderKanban,
  LayoutDashboard,
  MessageSquareText,
  Puzzle,
  RadioTower,
  Settings,
  ScrollText,
  Users,
} from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import AppLogo from './AppLogo.vue'
import { useI18n } from '@/i18n'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { sidebarCollapsed } = storeToRefs(appStore)
const { t, locale } = useI18n()

interface NavItem {
  name: string
  path: string
  icon: object
}

const navItems = computed<NavItem[]>(() => {
  locale.value
  return [
    { name: t('nav.dashboard'), path: '/', icon: LayoutDashboard },
    { name: t('nav.chat'), path: '/chat', icon: MessageSquareText },
    { name: t('nav.agents'), path: '/agents', icon: Bot },
    { name: t('nav.workflows'), path: '/workflows', icon: Boxes },
    { name: t('nav.platforms'), path: '/platforms', icon: Cable },
    { name: t('nav.groups'), path: '/groups', icon: Users },
    { name: t('nav.media'), path: '/media', icon: FolderKanban },
    { name: t('nav.modelProviders'), path: '/model-providers', icon: Bot },
    { name: t('nav.mcpServers'), path: '/mcp-servers', icon: RadioTower },
    { name: t('nav.skills'), path: '/skills', icon: Puzzle },
    { name: t('nav.logs'), path: '/logs', icon: ScrollText },
    { name: t('nav.settings'), path: '/settings', icon: Settings }
  ]
})

const isActivePath = (path: string) => route.path === path

const navigate = (path: string) => router.push(path)
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-icon"><AppLogo /></span>
        <div class="logo-copy" v-show="!sidebarCollapsed">
          <span class="logo-text">{{ t('app.name') }}</span>
        </div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <ul class="nav-list">
        <li v-for="item in navItems" :key="item.path">
          <button
            type="button"
            class="nav-item"
            :class="{ active: isActivePath(item.path) }"
            @click="navigate(item.path)"
            :title="sidebarCollapsed ? item.name : ''"
          >
            <component :is="item.icon" class="nav-icon" :size="18" />
            <span class="nav-text" v-show="!sidebarCollapsed">{{ item.name }}</span>
            <span class="active-indicator" v-if="isActivePath(item.path)"></span>
          </button>
        </li>
      </ul>
    </nav>

    <div class="sidebar-footer">
      <button type="button" class="collapse-btn" @click="appStore.toggleSidebar">
        <span class="collapse-icon" :class="{ rotated: sidebarCollapsed }">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: 260px;
  background: var(--sidebar-gradient);
  border-right: 1px solid var(--shell-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}

.sidebar.collapsed {
  width: 72px;
}

.sidebar.collapsed .logo-text,
.sidebar.collapsed .nav-text {
  opacity: 0;
  width: 0;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 14px;
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
  font-size: 1.05rem;
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
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  text-align: left;
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

.nav-text {
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
