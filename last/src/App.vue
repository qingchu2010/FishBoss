<script setup lang="ts">
import { onMounted, watch } from 'vue'
import Layout from '@/components/Layout.vue'
import { useAppStore } from '@/stores/app'
import { useMCPStore } from '@/stores/mcp'
import { useModelProviderStore } from '@/stores/modelProviders'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/i18n'

const appStore = useAppStore()
const mcpStore = useMCPStore()
const modelProviderStore = useModelProviderStore()
const { theme } = storeToRefs(appStore)
const { initLocale } = useI18n()

const applyTheme = (value: 'dark' | 'light') => {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', value)
  document.documentElement.style.colorScheme = value
}

onMounted(async () => {
  initLocale()
  try {
    await appStore.loadAppConfig()
  } catch (e) {
    console.error('Failed to load app config:', e)
  }
  try {
    await Promise.all([
      mcpStore.init().catch(e => console.error('MCP init failed:', e)),
      modelProviderStore.init().catch(e => console.error('Providers init failed:', e))
    ])
  } catch (e) {
    console.error('Store init failed:', e)
  }
  applyTheme(theme.value)
})

watch(theme, (value) => {
  applyTheme(value)
}, { immediate: true })
</script>

<template>
  <Layout>
    <router-view />
  </Layout>
</template>
