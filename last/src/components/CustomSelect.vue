<template>
  <div class="custom-select" ref="selectRef">
    <button class="select-trigger" @click="toggleDropdown">
      <span class="select-value">{{ currentLabel }}</span>
      <ChevronDown :size="16" :class="['chevron', { rotated: isOpen }]" />
    </button>
    <Teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          class="select-dropdown"
          :style="dropdownStyle"
        >
          <button
            v-for="opt in options"
            :key="opt.value"
            :class="['select-option', { active: modelValue === opt.value }]"
            @click="select(opt.value)"
          >
            <span>{{ opt.label }}</span>
            <Check v-if="modelValue === opt.value" :size="16" class="check-icon" />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'

export interface SelectOption {
  value: string | number
  label: string
}

const props = defineProps<{
  options: SelectOption[]
  modelValue: string | number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectRef = ref<HTMLElement>()
const isOpen = ref(false)
const dropdownStyle = ref<Record<string, string>>({})

const currentLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? ''
})

function updatePosition() {
  if (!selectRef.value) return
  const rect = selectRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 8}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`
  }
}

async function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updatePosition()
  }
}

function select(value: string | number) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('resize', updatePosition)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
  text-align: left;
}

.select-trigger:hover {
  border-color: var(--border-color-hover);
}

.select-value {
  flex: 1;
}

.chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.chevron.rotated {
  transform: rotate(180deg);
}

.select-dropdown {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px;
  z-index: 9999;
  box-shadow: var(--shadow-lg);
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
  background: var(--accent-soft-gradient);
  color: var(--accent-primary);
}

.check-icon {
  color: var(--accent-primary);
  flex-shrink: 0;
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
</style>
