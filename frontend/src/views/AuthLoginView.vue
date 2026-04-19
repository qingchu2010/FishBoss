<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { AlertCircle, Eye, EyeOff, Settings2, Shield, Sparkles, Workflow } from 'lucide-vue-next'
import { useAuthStore } from '@/stores'
import { useI18n } from '@/i18n'
import AppSettingsDrawer from '@/components/AppSettingsDrawer.vue'
import AppLogo from '@/assets/logo/AppLogo.vue'

const authStore = useAuthStore()
const { isSubmitting, authError, sessionExpired } = storeToRefs(authStore)
const { t } = useI18n()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const showSettings = ref(false)

async function handleSubmit(): Promise<void> {
  await authStore.login({
    username: username.value,
    password: password.value
  })
}
</script>

<template>
  <div class="login-view">
    <div class="login-bg">
      <div class="bg-grid"></div>
      <div class="bg-glow bg-glow-1"></div>
      <div class="bg-glow bg-glow-2"></div>
      <div class="bg-waves"></div>
      <div class="floating-particles">
        <div class="particle particle-1"></div>
        <div class="particle particle-2"></div>
        <div class="particle particle-3"></div>
        <div class="particle particle-4"></div>
        <div class="particle particle-5"></div>
      </div>
    </div>

    <button type="button" class="settings-btn" @click="showSettings = true">
      <Settings2 :size="18" />
    </button>

    <div class="login-container">
      <div class="login-brand-side">
        <div class="brand-content">
          <div class="brand-logo">
            <AppLogo />
          </div>
          <h1 class="brand-title">FishBoss</h1>
          <p class="brand-tagline">{{ t('page.default.subtitle') }}</p>
          <div class="brand-features">
            <div class="feature-item">
              <Shield :size="18" />
              <div>
                <strong>{{ t('nav.chat') }}</strong>
                <span>{{ t('page.chat.subtitle') }}</span>
              </div>
            </div>
            <div class="feature-item">
              <Sparkles :size="18" />
              <div>
                <strong>{{ t('nav.agents') }}</strong>
                <span>{{ t('page.agents.subtitle') }}</span>
              </div>
            </div>
            <div class="feature-item">
              <Workflow :size="18" />
              <div>
                <strong>{{ t('nav.groups') }}</strong>
                <span>{{ t('page.groups.subtitle') }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="brand-decoration">
          <div class="deco-ring deco-ring-1"></div>
          <div class="deco-ring deco-ring-2"></div>
          <div class="deco-ring deco-ring-3"></div>
        </div>
      </div>

      <div class="login-form-side">
        <div class="login-card">
          <div class="login-header">
            <h1>{{ t('auth.signIn') }}</h1>
            <p>{{ sessionExpired ? t('auth.sessionExpiredPleaseReLogin') : t('auth.signInHint') }}</p>
          </div>

          <div v-if="authError" class="login-error">
            <AlertCircle :size="16" />
            <span>{{ authError }}</span>
          </div>

          <form class="login-form" @submit.prevent="handleSubmit">
            <div class="form-field">
              <label class="form-label">{{ t('auth.username') }}</label>
              <input
                v-model="username"
                class="input"
                type="text"
                :placeholder="t('auth.usernamePlaceholder')"
                autocomplete="username"
                required
              />
            </div>

            <div class="form-field">
              <label class="form-label">{{ t('auth.password') }}</label>
              <div class="input-password-wrap">
                <input
                  v-model="password"
                  class="input"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('auth.passwordPlaceholder')"
                  autocomplete="current-password"
                  required
                />
                <button type="button" class="password-toggle" @click="showPassword = !showPassword">
                  <Eye v-if="!showPassword" :size="16" />
                  <EyeOff v-else :size="16" />
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-submit" :disabled="isSubmitting">
              <span v-if="isSubmitting" class="btn-spinner"></span>
              <template v-else>{{ t('auth.signIn') }}</template>
            </button>
          </form>

          <div class="login-footer">
            <div class="backend-status">
              <Shield :size="12" />
              <span>{{ t('auth.adminAccountMode') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AppSettingsDrawer :is-open="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.login-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background: var(--hero-gradient);
  z-index: 0;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.025) 1px, transparent 1px);
  background-size: 48px 48px;
}

.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
}

.bg-glow-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(124, 147, 255, 0.15), transparent 60%);
  top: -200px;
  left: -100px;
  opacity: 0.7;
  animation: pulse 8s ease-in-out infinite;
}

.bg-glow-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(84, 210, 255, 0.12), transparent 60%);
  bottom: -150px;
  right: -100px;
  opacity: 0.6;
  animation: pulse 10s ease-in-out infinite reverse;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.bg-waves {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 200px;
  background: linear-gradient(180deg, transparent, rgba(84, 210, 255, 0.03));
  pointer-events: none;
}

.bg-waves::before,
.bg-waves::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: -50%;
  width: 200%;
  height: 100px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='%237c93ff' fill-opacity='0.03' d='M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z'%3E%3C/path%3E%3C/svg%3E") repeat-x;
  background-size: 50% 100%;
  animation: wave 20s linear infinite;
}

.bg-waves::after {
  bottom: 10px;
  opacity: 0.5;
  animation-duration: 15s;
  animation-direction: reverse;
}

@keyframes wave {
  0% { transform: translateX(0); }
  100% { transform: translateX(50%); }
}

.floating-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.particle {
  position: absolute;
  border-radius: 50%;
  background: var(--accent-primary);
  opacity: 0.3;
}

.particle-1 {
  width: 8px;
  height: 8px;
  top: 20%;
  left: 15%;
  animation: float 6s ease-in-out infinite;
}

.particle-2 {
  width: 6px;
  height: 6px;
  top: 60%;
  left: 25%;
  background: var(--accent-secondary);
  animation: float 8s ease-in-out infinite 1s;
}

.particle-3 {
  width: 10px;
  height: 10px;
  top: 30%;
  left: 35%;
  background: var(--accent-tertiary);
  animation: float 7s ease-in-out infinite 2s;
}

.particle-4 {
  width: 5px;
  height: 5px;
  top: 70%;
  left: 10%;
  animation: float 9s ease-in-out infinite 0.5s;
}

.particle-5 {
  width: 7px;
  height: 7px;
  top: 45%;
  left: 20%;
  background: var(--accent-secondary);
  animation: float 6s ease-in-out infinite 3s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) translateX(0) scale(1);
    opacity: 0.3;
  }
  50% {
    transform: translateY(-30px) translateX(10px) scale(1.2);
    opacity: 0.6;
  }
}

.settings-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--bg-hover);
}

.login-container {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 1000px;
  min-height: 580px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  backdrop-filter: blur(20px);
}

.login-brand-side {
  flex: 0 0 40%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  background: linear-gradient(135deg, rgba(124, 147, 255, 0.08), rgba(84, 210, 255, 0.04));
  border-right: 1px solid var(--border-color);
  overflow: hidden;
}

.brand-content {
  position: relative;
  z-index: 2;
  text-align: center;
  animation: fadeInUp 0.8s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.brand-logo {
  margin-bottom: var(--spacing-6);
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.brand-title {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2) 0;
  letter-spacing: -0.02em;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-tagline {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-8) 0;
  line-height: 1.6;
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  transition: background var(--transition-fast), transform var(--transition-fast);
  text-align: left;
}

.feature-item:hover {
  background: var(--bg-active);
  transform: translateX(4px);
}

.feature-item svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.feature-item div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feature-item strong {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.feature-item span {
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.brand-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.deco-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  opacity: 0.3;
}

.deco-ring-1 {
  width: 300px;
  height: 300px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: rotate 30s linear infinite;
}

.deco-ring-2 {
  width: 400px;
  height: 400px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: rotate 40s linear infinite reverse;
}

.deco-ring-3 {
  width: 500px;
  height: 500px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: rotate 50s linear infinite;
}

@keyframes rotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.login-form-side {
  flex: 0 0 60%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
}

.login-card {
  width: 100%;
  max-width: 360px;
  animation: fadeIn 0.6s ease-out 0.2s both;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.login-header {
  margin-bottom: var(--spacing-8);
  text-align: center;
}

.login-header h1 {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2) 0;
  letter-spacing: -0.01em;
}

.login-header p {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.login-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-6);
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.input {
  width: 100%;
  height: 46px;
  padding: 0 var(--spacing-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.input::placeholder {
  color: var(--text-muted);
}

.input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-bg), 0 0 20px var(--accent-glow);
}

.input-password-wrap {
  position: relative;
}

.input-password-wrap .input {
  padding-right: 44px;
}

.password-toggle {
  position: absolute;
  right: var(--spacing-3);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--spacing-2);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.password-toggle:hover {
  color: var(--accent-primary);
  background: var(--bg-hover);
}

.btn-submit {
  width: 100%;
  height: 48px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  color: white;
  box-shadow: 0 8px 24px var(--accent-glow);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px var(--accent-glow);
}

.btn-submit:disabled {
  opacity: 0.7;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-footer {
  display: flex;
  justify-content: center;
  margin-top: var(--spacing-8);
}

.backend-status {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: var(--spacing-2) var(--spacing-3);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
}

@media (max-width: 768px) {
  .login-container {
    flex-direction: column;
    max-width: 420px;
    min-height: auto;
  }

  .login-brand-side {
    flex: none;
    padding: var(--spacing-8) var(--spacing-6);
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .brand-logo svg {
    width: 100px;
    height: 100px;
  }

  .brand-title {
    font-size: var(--font-size-xl);
  }

  .brand-tagline {
    font-size: var(--font-size-xs);
    margin-bottom: var(--spacing-4);
  }

  .brand-features {
    display: none;
  }

  .login-form-side {
    flex: none;
    padding: var(--spacing-8) var(--spacing-6);
  }

  .login-card {
    max-width: 100%;
  }

  .deco-ring {
    display: none;
  }
}
</style>
