<template>
  <div class="agent-selector">
    <label class="selector-label">{{ t('common.agent') }}:</label>
    <div class="custom-select">
      <button class="select-trigger" @click="dropdownOpen = !dropdownOpen">
        <span>{{ selectedName || t('chat.selectAgent') }}</span>
        <ChevronDown :size="16" :class="['chevron', { rotated: dropdownOpen }]" />
      </button>
      <Transition name="dropdown">
        <div v-if="dropdownOpen" class="select-dropdown">
          <button
            v-for="agent in agents"
            :key="agent.id"
            :class="['select-option', { active: selectedId === agent.id }]"
            @click="selectAgent(agent.id)"
          >
            <span>{{ agent.name }}</span>
            <Check v-if="selectedId === agent.id" :size="14" />
          </button>
        </div>
      </Transition>
    </div>
    <div class="tool-toggle">
      <label class="toggle-label">
        <Wrench :size="16" />
        <span>{{ t('chat.toolCall') }}</span>
      </label>
      <button 
        :class="['toggle-switch', { active: toolCallEnabled }]" 
        @click="$emit('update:toolCallEnabled', !toolCallEnabled)"
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>
    <div v-if="contextUsage > 0" class="context-indicator">
      <Gauge :size="14" />
      <span :class="['context-usage', { warning: contextUsage > 70, critical: contextUsage > 90 }]">
        {{ Math.round(contextUsage) }}%
      </span>
      <div v-if="isCompressing" class="compression-indicator">
        <Loader2 :size="12" class="spin" />
        <span>{{ t('chat.compressing') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, Check, Wrench, Gauge, Loader2 } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

interface Agent {
  id: string
  name: string
}

const props = defineProps<{
  agents: Agent[]
  selectedId: string | null
  toolCallEnabled: boolean
  contextUsage: number
  isCompressing: boolean
}>()

const emit = defineEmits<{
  'update:selectedId': [id: string]
  'update:toolCallEnabled': [value: boolean]
}>()

const { t } = useI18n()
const dropdownOpen = ref(false)

const selectedName = computed(() => {
  if (!props.selectedId) return ''
  return props.agents.find(a => a.id === props.selectedId)?.name || ''
})

function selectAgent(id: string) {
  emit('update:selectedId', id)
  dropdownOpen.value = false
}
</script>

<style scoped>
.agent-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.selector-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.tool-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.context-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.context-indicator:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.context-usage {
  font-weight: 500;
}

.context-usage.warning {
  color: #f59e0b;
}

.context-usage.critical {
  color: #ef4444;
}

.compression-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  color: var(--accent-primary);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.toggle-switch {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
}

.toggle-switch:hover {
  border-color: var(--border-color-hover);
}

.toggle-switch.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all var(--transition-fast);
}

.toggle-switch.active .toggle-thumb {
  left: 18px;
  background: white;
}

.custom-select {
  position: relative;
  flex: 1;
  max-width: 280px;
}

.select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-trigger:hover {
  border-color: var(--border-color-hover);
}

.select-trigger .chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.select-trigger .chevron.rotated {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px;
  z-index: 10;
  box-shadow: var(--shadow-md);
  max-height: 200px;
  overflow-y: auto;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.select-option:hover {
  background: var(--bg-hover);
}

.select-option.active {
  color: var(--accent-primary);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
