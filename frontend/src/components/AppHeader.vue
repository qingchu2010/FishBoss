<script setup lang="ts">
import { Menu, Bell, Settings } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import { ROUTES } from '@/config'

const appStore = useAppStore()
const router = useRouter()
</script>

<template>
  <header class="app-header">
    <button class="menu-btn" @click="appStore.toggleSidebar">
      <Menu :size="20" />
    </button>
    <div class="header-spacer"></div>
    <button class="icon-btn" @click="router.push(ROUTES.LOGS)">
      <Bell :size="20" />
    </button>
    <button class="icon-btn" @click="router.push(ROUTES.SETTINGS)">
      <Settings :size="20" />
    </button>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  height: var(--header-height);
  padding: 0 var(--spacing-6);
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.menu-btn,
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.menu-btn:hover,
.icon-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.header-spacer {
  flex: 1;
}
</style>
