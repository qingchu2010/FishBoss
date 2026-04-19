<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAppStore, useAuthStore } from '@/stores'
import { useI18n } from '@/i18n'
import AuthGate from '@/components/AuthGate.vue'

const appStore = useAppStore()
const authStore = useAuthStore()
const { initLocale, loadLocaleFromBackend } = useI18n()

onMounted(async () => {
  initLocale()
  appStore.initializeTheme()
  await loadLocaleFromBackend()
  await appStore.loadFrontendConfigFromBackend()
  await authStore.initialize()
})

watch(() => authStore.isAuthenticated, async (isAuthenticated, wasAuthenticated) => {
  if (isAuthenticated && !wasAuthenticated) {
    await loadLocaleFromBackend()
    await appStore.loadFrontendConfigFromBackend()
  }
})
</script>

<template>
  <AuthGate />
</template>
