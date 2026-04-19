<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores'
import { useI18n } from '@/i18n'
import AuthBootstrapView from '@/views/AuthBootstrapView.vue'
import AuthLoginView from '@/views/AuthLoginView.vue'
import AppLayout from '@/layouts/AppLayout.vue'

const authStore = useAuthStore()
const { status } = storeToRefs(authStore)
const { t } = useI18n()

const showChecking = computed(() => status.value === 'checking')
const showBootstrap = computed(() => status.value === 'setup_required')
const showLogin = computed(() => status.value === 'unauthenticated')
const showApp = computed(() => status.value === 'authenticated')
</script>

<template>
  <div class="auth-gate">
    <div v-if="showChecking" class="auth-checking">
      <div class="auth-checking-inner">
        <div class="auth-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="var(--bg-elevated)" />
            <path d="M14 24C14 18.477 18.477 14 24 14C29.523 14 34 18.477 34 24" stroke="var(--accent-primary)" stroke-width="2.5" stroke-linecap="round" />
            <path d="M24 14V24L30 30" stroke="var(--accent-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="24" cy="24" r="3" fill="var(--accent-primary)" />
            <path d="M14 32C16.5 35.5 20.5 38 24 38C27.5 38 31.5 35.5 34 32" stroke="var(--accent-tertiary)" stroke-width="2" stroke-linecap="round" opacity="0.6" />
          </svg>
        </div>
        <p class="auth-checking-text">{{ t('auth.checkingStatus') }}</p>
      </div>
    </div>

    <AuthBootstrapView v-else-if="showBootstrap" />

    <AuthLoginView v-else-if="showLogin" />

    <AppLayout v-else-if="showApp">
      <RouterView />
    </AppLayout>
  </div>
</template>

<style scoped>
.auth-gate {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.auth-checking {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hero-gradient);
}

.auth-checking-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.auth-logo {
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% {
    filter: drop-shadow(0 0 8px var(--accent-glow));
  }
  50% {
    filter: drop-shadow(0 0 20px var(--accent-glow));
  }
}

.auth-checking-text {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin: 0;
}
</style>
