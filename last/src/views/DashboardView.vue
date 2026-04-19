<template>
  <div class="dashboard-view">
    <div class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">{{ t('page.dashboard.title') }}</h1>
        <p class="hero-subtitle">{{ t('page.dashboard.subtitle') }}</p>
      </div>
      <div class="hero-status">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>{{ t('dashboard.systemOnline') }}</span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" v-for="(stat, index) in stats" :key="index" :style="{ '--delay': index * 0.1 + 's' }">
        <div class="stat-icon-wrap" :style="{ background: stat.gradient }">
          <component :is="stat.icon" :size="22" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
        <div class="stat-trend" v-if="stat.trend !== undefined">
          <TrendingUp :size="14" :class="{ down: stat.trend < 0 }" />
        </div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card chart-large">
        <div class="chart-header">
          <h3>
            <PieChart :size="18" />
            {{ t('dashboard.modelDistribution') }}
          </h3>
        </div>
        <div class="chart-body" ref="pieChartRef"></div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>
            <BarChart3 :size="18" />
            {{ t('dashboard.providerOverview') }}
          </h3>
        </div>
        <div class="chart-body" ref="barChartRef"></div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>
            <Activity :size="18" />
            {{ t('dashboard.systemInfo') }}
          </h3>
        </div>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.platform') }}</span>
            <span class="info-value">{{ systemInfo.platform }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.architecture') }}</span>
            <span class="info-value">{{ systemInfo.arch }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.cpuCores') }}</span>
            <span class="info-value">{{ systemInfo.cpus }} {{ t('dashboard.cores') }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.memoryUsage') }}</span>
            <div class="memory-bar">
              <div class="memory-fill" :style="{ width: memoryPercent + '%' }"></div>
              <span class="memory-text">{{ memoryUsed }} / {{ memoryTotal }}</span>
            </div>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.uptime') }}</span>
            <span class="info-value">{{ uptimeStr }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.theme') }}</span>
            <span class="info-value badge" :class="systemInfo.theme">{{ systemInfo.theme === 'dark' ? 'Dark' : 'Light' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('dashboard.configPath') }}</span>
            <span class="info-value mono">{{ systemInfo.configDir }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart as EChartsPie, BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { Bot, Zap, BarChart3, PieChart, Activity, TrendingUp, Cpu, HardDrive } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { api } from '@/services/api'

use([CanvasRenderer, EChartsPie, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const { t } = useI18n()

const pieChartRef = ref<HTMLElement>()
const barChartRef = ref<HTMLElement>()

let pieChartInstance: any = null
let barChartInstance: any = null

interface DashboardStats {
  providers: {
    total: number
    enabled: number
    byType: Record<string, { total: number; enabled: number }>
  }
  agents: {
    total: number
  }
  models: {
    total: number
    distribution: Record<string, number>
  }
  system: {
    platform: string
    arch: string
    uptime: number
    memory: { total: number; free: number }
    cpus: number
    theme: string
    locale: string
    configDir: string
  }
}

const statsData = ref<DashboardStats | null>(null)
const loading = ref(true)

const stats = computed(() => {
  const data = statsData.value
  if (!data) return []

  return [
    {
      icon: Bot,
      value: data.providers.total,
      label: t('dashboard.totalProviders'),
      gradient: 'linear-gradient(135deg, #7c93ff 0%, #54d2ff 100%)',
      trend: data.providers.enabled
    },
    {
      icon: Cpu,
      value: data.agents.total,
      label: t('dashboard.totalAgents'),
      gradient: 'linear-gradient(135deg, #9f7aea 0%, #f472b6 100%)',
      trend: undefined
    },
    {
      icon: Zap,
      value: data.models.total,
      label: t('dashboard.totalModels'),
      gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
      trend: undefined
    },
    {
      icon: HardDrive,
      value: data.providers.enabled,
      label: t('dashboard.activeProviders'),
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      trend: undefined
    }
  ]
})

const systemInfo = computed(() => statsData.value?.system || {
  platform: '-',
  arch: '-',
  uptime: 0,
  memory: { total: 0, free: 0 },
  cpus: 0,
  theme: 'dark',
  locale: 'zh_CN',
  configDir: '-'
})

const memoryPercent = computed(() => {
  if (!systemInfo.value.memory.total) return 0
  const used = systemInfo.value.memory.total - systemInfo.value.memory.free
  return Math.round((used / systemInfo.value.memory.total) * 100)
})

const memoryUsed = computed(() => formatBytes(systemInfo.value.memory.total - systemInfo.value.memory.free))
const memoryTotal = computed(() => formatBytes(systemInfo.value.memory.total))

const uptimeStr = computed(() => {
  const seconds = Math.floor(systemInfo.value.uptime)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function initPieChart() {
  if (!pieChartRef.value || !statsData.value?.models.distribution) return

  const dist = statsData.value.models.distribution
  const data = Object.entries(dist).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value
  }))

  pieChartInstance = (window as any).echarts.init(pieChartRef.value)
  pieChartInstance.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(20, 27, 47, 0.96)',
      borderColor: 'rgba(124, 147, 255, 0.2)',
      textStyle: { color: '#eef2ff' },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#a8b3cf', fontSize: 12 },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16
    },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['40%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 8,
        borderColor: 'rgba(9, 11, 20, 0.8)',
        borderWidth: 3
      },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold',
          color: '#eef2ff'
        },
        itemStyle: {
          shadowBlur: 20,
          shadowColor: 'rgba(124, 147, 255, 0.3)'
        }
      },
      data,
      color: ['#7c93ff', '#54d2ff', '#9f7aea', '#10b981', '#f59e0b', '#ef4444']
    }]
  })
}

function initBarChart() {
  if (!barChartRef.value || !statsData.value?.providers.byType) return

  const byType = statsData.value.providers.byType
  const types = Object.entries(byType).map(([type, info]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    total: info.total,
    enabled: info.enabled
  }))

  barChartInstance = (window as any).echarts.init(barChartRef.value)
  barChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 27, 47, 0.96)',
      borderColor: 'rgba(124, 147, 255, 0.2)',
      textStyle: { color: '#eef2ff' },
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '12%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: types.map(t => t.name),
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)' } },
      axisLabel: { color: '#6f7d9d', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.08)' } },
      axisLabel: { color: '#6f7d9d', fontSize: 11 }
    },
    series: [
      {
        name: t('dashboard.total'),
        type: 'bar',
        barWidth: '28%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#7c93ff' },
            { offset: 1, color: 'rgba(124, 147, 255, 0.3)' }
          ])
        },
        data: types.map(t => t.total)
      },
      {
        name: t('dashboard.enabled'),
        type: 'bar',
        barWidth: '28%',
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#10b981' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.3)' }
          ])
        },
        data: types.map(t => t.enabled)
      }
    ]
  })
}

async function loadStats() {
  loading.value = true
  try {
    statsData.value = await api.getDashboardStats()
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  } finally {
    loading.value = false
  }
}

function handleResize() {
  pieChartInstance?.resize()
  barChartInstance?.resize()
}

onMounted(async () => {
  await loadStats()
  setTimeout(() => {
    initPieChart()
    initBarChart()
  }, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  pieChartInstance?.dispose()
  barChartInstance?.dispose()
})
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: fadeIn 0.4s ease;
  height: 100%;
  overflow-y: overlay;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-section {
  background: var(--hero-panel-gradient);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-lg);
  padding: 32px 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

.hero-section::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -10%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(124, 147, 255, 0.12), transparent 70%);
  pointer-events: none;
}

.hero-title {
  font-size: 1.65rem;
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
  max-width: 480px;
}

.hero-status {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 20px;
  font-size: 0.85rem;
  color: var(--color-success);
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 22px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all var(--transition-normal);
  animation: slideUp 0.5s ease backwards;
  animation-delay: var(--delay);
  position: relative;
  overflow: hidden;
}

.stat-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), transparent);
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-color-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.stat-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.stat-trend {
  color: var(--color-success);
  display: flex;
  align-items: center;
}

.stat-trend.down {
  color: var(--color-error);
}

.charts-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: auto auto;
  gap: 16px;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
  transition: border-color var(--transition-normal);
}

.chart-card:hover {
  border-color: var(--border-color-hover);
}

.chart-large {
  grid-row: span 2;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.chart-header h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.chart-header h3 svg {
  color: var(--accent-primary);
}

.chart-body {
  height: 280px;
  width: 100%;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.info-value {
  font-size: 0.88rem;
  color: var(--text-primary);
  font-weight: 500;
  max-width: 60%;
  text-align: right;
  word-break: break-all;
}

.info-value.mono {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.info-value.badge {
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.info-value.badge.dark {
  background: rgba(124, 147, 255, 0.15);
  color: var(--accent-primary);
}

.info-value.badge.light {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.memory-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 55%;
  position: relative;
  height: 6px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.memory-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #7c93ff, #54d2ff);
  transition: width 0.6s ease;
}

.memory-text {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>
