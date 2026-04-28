<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Bot, Cloud, Zap, Boxes, Workflow, 
  MessageSquare, Settings, FolderOpen,
  HardDrive, Clock, ChevronRight,
  Activity, Sparkles, ArrowUpRight, Gauge
} from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { systemApi, type SystemStats } from '@/services/system'

const { t } = useI18n()
const router = useRouter()

const statsData = ref<SystemStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const quickActions = computed(() => [
  { icon: MessageSquare, label: t('dashboard.newConversation'), path: '/conversations', gradient: 'linear-gradient(135deg, #7c93ff 0%, #54d2ff 100%)' },
  { icon: Bot, label: t('dashboard.createAgent'), path: '/agents', gradient: 'linear-gradient(135deg, #9f7aea 0%, #f472b6 100%)' },
  { icon: Cloud, label: t('dashboard.addProvider'), path: '/providers', gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' },
  { icon: Boxes, label: t('dashboard.addMcpServer'), path: '/mcp', gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)' }
])

const mainStats = computed(() => {
  const d = statsData.value?.dashboard
  if (!d) return []
  return [
    { 
      icon: Cloud, 
      value: d.providers.total, 
      sub: `${d.providers.enabled} ${t('dashboard.enabled')}`,
      label: t('dashboard.providers'), 
      path: '/providers',
      gradient: 'linear-gradient(135deg, #7c93ff 0%, #54d2ff 100%)',
      bgGlow: 'rgba(124, 147, 255, 0.15)'
    },
    { 
      icon: Bot, 
      value: d.agents.total, 
      sub: t('dashboard.configured'),
      label: t('nav.agents'), 
      path: '/agents',
      gradient: 'linear-gradient(135deg, #9f7aea 0%, #f472b6 100%)',
      bgGlow: 'rgba(159, 122, 234, 0.15)'
    },
    { 
      icon: Zap, 
      value: d.models.total, 
      sub: t('dashboard.available'),
      label: t('dashboard.models'), 
      path: '/providers',
      gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
      bgGlow: 'rgba(16, 185, 129, 0.15)'
    },
    { 
      icon: Boxes, 
      value: statsData.value?.counts.mcp ?? 0, 
      sub: t('dashboard.servers'),
      label: t('nav.mcpServers'), 
      path: '/mcp',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      bgGlow: 'rgba(245, 158, 11, 0.15)'
    },
    { 
      icon: Workflow, 
      value: statsData.value?.counts.workflows ?? 0, 
      sub: t('dashboard.created'),
      label: t('nav.workflows'), 
      path: '/workflows',
      gradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
      bgGlow: 'rgba(236, 72, 153, 0.15)'
    }
  ]
})

const systemInfo = computed(() => {
  const d = statsData.value?.dashboard?.system
  if (!d) return null
  const usedMem = d.memory.total - d.memory.free
  const memPercent = Math.round((usedMem / d.memory.total) * 100)
  return {
    platform: `${d.platform} ${d.arch}`,
    cpus: d.cpus,
    memory: {
      used: formatBytes(usedMem),
      total: formatBytes(d.memory.total),
      percent: memPercent
    },
    uptime: formatUptime(d.uptime),
    configDir: d.configDir
  }
})

const storageItems = computed(() => {
  const counts = statsData.value?.counts
  if (!counts) return []
  return [
    { label: t('dashboard.prompts'), count: counts.prompts, icon: Sparkles, color: '#7c93ff' },
    { label: t('dashboard.configFiles'), count: counts.config, icon: Settings, color: '#9f7aea' },
    { label: t('dashboard.dataFiles'), count: counts.data, icon: FolderOpen, color: '#10b981' },
    { label: t('dashboard.skills'), count: counts.skills, icon: Zap, color: '#f59e0b' }
  ]
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

async function loadStats() {
  loading.value = true
  error.value = null
  try {
    statsData.value = await systemApi.getStats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('common.error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="dashboard-view">
    <div v-if="error" class="error-banner">
      <p>{{ error }}</p>
      <button class="btn btn-secondary" @click="loadStats">{{ t('dashboard.retry') }}</button>
    </div>

    <div class="hero-section">
      <div class="hero-bg">
        <div class="hero-orb hero-orb-1"></div>
        <div class="hero-orb hero-orb-2"></div>
        <div class="hero-orb hero-orb-3"></div>
      </div>
      <div class="hero-content">
        <div class="hero-badge">
          <Activity :size="12" />
          <span>{{ t('dashboard.systemOnline') }}</span>
        </div>
        <h1 class="hero-title">{{ t('dashboard.welcome') }}</h1>
        <p class="hero-subtitle">{{ t('page.dashboard.subtitle') }}</p>
      </div>
      <div class="hero-actions">
        <button 
          v-for="action in quickActions" 
          :key="action.path"
          class="hero-action-btn"
          @click="router.push(action.path)"
        >
          <div class="hero-action-icon" :style="{ background: action.gradient }">
            <component :is="action.icon" :size="16" />
          </div>
          <span>{{ action.label }}</span>
          <ArrowUpRight :size="14" class="hero-action-arrow" />
        </button>
      </div>
    </div>

    <div class="main-grid">
      <div class="stats-section">
        <div class="section-header">
          <h2 class="section-title">{{ t('dashboard.overview') }}</h2>
          <span class="section-badge">5 {{ t('dashboard.metrics') }}</span>
        </div>
        <div class="stats-grid">
          <button 
            v-for="(stat, index) in mainStats" 
            :key="stat.path"
            class="stat-card"
            :style="{ '--delay': index * 0.06 + 's', '--glow': stat.bgGlow }"
            @click="router.push(stat.path)"
          >
            <div class="stat-glow"></div>
            <div class="stat-icon" :style="{ background: stat.gradient }">
              <component :is="stat.icon" :size="20" />
            </div>
            <div class="stat-body">
              <div class="stat-header">
                <span class="stat-value">{{ loading ? '-' : stat.value }}</span>
                <span class="stat-sub">{{ stat.sub }}</span>
              </div>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
            <ChevronRight :size="18" class="stat-arrow" />
          </button>
        </div>
      </div>

      <div class="side-section">
        <div class="system-card">
          <div class="card-header">
            <div class="card-icon-wrap">
              <Gauge :size="16" />
            </div>
            <h3 class="card-title">{{ t('dashboard.systemStatus') }}</h3>
          </div>
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
          </div>
          <div v-else-if="systemInfo" class="system-info">
            <div class="info-row">
              <span class="info-label">{{ t('dashboard.platform') }}</span>
              <span class="info-value">{{ systemInfo.platform }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('dashboard.cpuCores') }}</span>
              <span class="info-value chip">{{ systemInfo.cpus }} {{ t('dashboard.cores') }}</span>
            </div>
            <div class="info-row memory-row">
              <span class="info-label">{{ t('dashboard.memoryUsage') }}</span>
              <div class="memory-block">
                <div class="memory-header">
                  <span class="memory-percent">{{ systemInfo.memory.percent }}%</span>
                  <span class="memory-text">{{ systemInfo.memory.used }} / {{ systemInfo.memory.total }}</span>
                </div>
                <div class="memory-bar">
                  <div class="memory-fill" :style="{ width: systemInfo.memory.percent + '%' }"></div>
                </div>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('dashboard.uptime') }}</span>
              <span class="info-value uptime">
                <Clock :size="12" />
                {{ systemInfo.uptime }}
              </span>
            </div>
          </div>
        </div>

        <div class="storage-card">
          <div class="card-header">
            <div class="card-icon-wrap storage-icon">
              <HardDrive :size="16" />
            </div>
            <h3 class="card-title">{{ t('dashboard.storage') }}</h3>
          </div>
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
          </div>
          <div v-else class="storage-grid">
            <div v-for="item in storageItems" :key="item.label" class="storage-item">
              <div class="storage-icon-wrap" :style="{ background: item.color + '20' }">
                <component :is="item.icon" :size="14" :style="{ color: item.color }" />
              </div>
              <div class="storage-info">
                <span class="storage-label">{{ item.label }}</span>
                <span class="storage-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
  animation: fadeIn 0.5s ease;
  height: 100%;
  overflow-y: overlay;
  padding-bottom: 32px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-section {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 36px 40px;
  background: linear-gradient(135deg, rgba(124, 147, 255, 0.08) 0%, rgba(84, 210, 255, 0.04) 50%, rgba(159, 122, 234, 0.06) 100%);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.6;
  animation: float 8s ease-in-out infinite;
}

.hero-orb-1 {
  width: 200px;
  height: 200px;
  background: rgba(124, 147, 255, 0.3);
  top: -50%;
  right: 10%;
  animation-delay: 0s;
}

.hero-orb-2 {
  width: 150px;
  height: 150px;
  background: rgba(84, 210, 255, 0.25);
  bottom: -30%;
  right: 30%;
  animation-delay: -2s;
}

.hero-orb-3 {
  width: 120px;
  height: 120px;
  background: rgba(159, 122, 234, 0.2);
  top: 20%;
  right: 50%;
  animation-delay: -4s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(20px, -20px) scale(1.05); }
  66% { transform: translate(-10px, 10px) scale(0.95); }
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 16px;
  font-size: 0.75rem;
  color: var(--color-success);
  font-weight: 500;
  margin-bottom: 12px;
}

.hero-title {
  font-size: 1.75rem;
  font-weight: 700;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 6px 0;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
  max-width: 400px;
}

.hero-actions {
  display: flex;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.hero-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.25s ease;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
}

.hero-action-btn:hover {
  border-color: var(--accent-primary);
  background: rgba(124, 147, 255, 0.08);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(124, 147, 255, 0.15);
}

.hero-action-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.hero-action-arrow {
  color: var(--text-muted);
  opacity: 0;
  transform: translate(-4px, 4px);
  transition: all 0.25s ease;
}

.hero-action-btn:hover .hero-action-arrow {
  opacity: 1;
  transform: translate(0, 0);
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 28px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-badge {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: rgba(148, 163, 184, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.3s ease;
  animation: cardSlide 0.5s ease backwards;
  animation-delay: var(--delay);
  text-align: left;
  overflow: hidden;
}

@keyframes cardSlide {
  from { 
    opacity: 0; 
    transform: translateY(20px) scale(0.98); 
  }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.stat-glow {
  position: absolute;
  inset: 0;
  background: var(--glow);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-color-hover);
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.stat-card:hover .stat-glow {
  opacity: 1;
}

.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.stat-body {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.stat-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.stat-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: rgba(148, 163, 184, 0.1);
  padding: 2px 8px;
  border-radius: 8px;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 4px;
  display: block;
}

.stat-arrow {
  color: var(--accent-primary);
  opacity: 0;
  transform: translateX(-6px);
  transition: all 0.25s ease;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.stat-card:hover .stat-arrow {
  opacity: 1;
  transform: translateX(0);
}

.side-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.system-card,
.storage-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 22px;
  transition: border-color 0.25s ease;
}

.system-card:hover,
.storage-card:hover {
  border-color: var(--border-color-hover);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.card-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(124, 147, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
}

.card-icon-wrap.storage-icon {
  background: rgba(16, 185, 129, 0.12);
  color: var(--color-success);
}

.card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.system-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06);
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.info-value {
  font-size: 0.8rem;
  color: var(--text-primary);
  font-weight: 500;
}

.info-value.chip {
  background: rgba(124, 147, 255, 0.1);
  color: var(--accent-primary);
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.75rem;
}

.info-value.uptime {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--accent-primary);
}

.memory-row {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 12px 0;
}

.memory-block {
  width: 100%;
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.memory-percent {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent-primary);
}

.memory-text {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.memory-bar {
  height: 6px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.memory-fill {
  height: 100%;
  background: linear-gradient(90deg, #7c93ff, #54d2ff);
  border-radius: 3px;
  transition: width 0.6s ease;
}

.storage-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.storage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: rgba(148, 163, 184, 0.04);
  border-radius: var(--radius-sm);
  transition: background 0.2s ease;
}

.storage-item:hover {
  background: rgba(148, 163, 184, 0.08);
}

.storage-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.storage-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.storage-label {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.storage-count {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-md);
  color: var(--color-error);
}

@media (max-width: 1100px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
  
  .side-section {
    flex-direction: row;
  }
  
  .system-card,
  .storage-card {
    flex: 1;
  }
}

@media (max-width: 900px) {
  .hero-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }
  
  .hero-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  
  .hero-action-btn {
    flex: 1;
    min-width: 140px;
  }
  
  .side-section {
    flex-direction: column;
  }
}

@media (max-width: 600px) {
  .hero-actions {
    flex-direction: column;
  }
  
  .hero-action-btn {
    width: 100%;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .storage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
