<template>
  <div class="ask-inline">
    <div class="ask-inline-header">
      <div class="ask-inline-title">
        <HelpCircle :size="16" />
        <span>{{ ask.header || t('chat.question') }}</span>
      </div>
      <span v-if="ask.questions.length > 1" class="ask-progress">
        {{ stepIndex + 1 }}/{{ ask.questions.length }}
      </span>
    </div>
    <div v-if="currentQuestion" class="ask-inline-question">{{ currentQuestion.question }}</div>
    <div v-if="currentQuestion" class="ask-inline-options">
      <button
        v-for="(option, index) in currentQuestion.options"
        :key="index"
        :class="['ask-inline-option', { selected: isOptionSelected(option.label) }]"
        @click="toggleOption(option.label)"
      >
        <div class="ask-option-checkbox">
          <Check v-if="isOptionSelected(option.label)" :size="14" />
        </div>
        <div class="ask-option-content">
          <div class="ask-inline-option-label">{{ option.label }}</div>
          <div v-if="option.description" class="ask-inline-option-desc">{{ option.description }}</div>
        </div>
      </button>
    </div>
    <div class="ask-custom-input">
      <input
        v-model="customInputLocal"
        type="text"
        :placeholder="t('chat.customInputPlaceholder')"
        class="ask-input"
      />
    </div>
    <div class="ask-inline-actions">
      <button class="btn btn-sm btn-secondary" @click="$emit('cancel')">{{ t('chat.cancel') }}</button>
      <button v-if="ask.questions.length > 1" class="btn btn-sm btn-secondary" :disabled="!canMovePrevious" @click="$emit('previous')">
        <ChevronLeft :size="14" />
        <span>{{ t('chat.previous') }}</span>
      </button>
      <button v-if="ask.questions.length > 1 && canMoveNext" class="btn btn-sm btn-secondary" @click="$emit('next')">
        <span>{{ t('chat.next') }}</span>
        <ChevronRight :size="14" />
      </button>
      <button class="btn btn-sm btn-primary" :disabled="!canSubmit" @click="$emit('submit')">
        {{ t('chat.confirm') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { HelpCircle, Check, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

interface AskQuestion {
  question: string
  options: Array<{ label: string; description?: string }>
  multiSelect: boolean
}

interface Ask {
  id: string
  header?: string
  questions: AskQuestion[]
}

const props = defineProps<{
  ask: Ask
  stepIndex: number
  selectedOptions: string[]
  customInput: string
  canMovePrevious: boolean
  canMoveNext: boolean
  canSubmit: boolean
}>()

const emit = defineEmits<{
  cancel: []
  previous: []
  next: []
  submit: []
  'toggle-option': [label: string]
  'update:customInput': [value: string]
}>()

const { t } = useI18n()

const customInputLocal = computed({
  get: () => props.customInput,
  set: (val) => emit('update:customInput', val)
})

const currentQuestion = computed(() => {
  return props.ask.questions[props.stepIndex] || null
})

function isOptionSelected(label: string): boolean {
  return props.selectedOptions.includes(label)
}

function toggleOption(label: string) {
  emit('toggle-option', label)
}
</script>

<style scoped>
.ask-inline {
  width: min(100%, 840px);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
}

.ask-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent-primary);
  margin-bottom: 12px;
}

.ask-inline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ask-progress {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.ask-inline-question {
  font-size: 0.95rem;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 16px;
}

.ask-inline-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.ask-inline-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.ask-inline-option:hover {
  background: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.ask-inline-option.selected {
  background: var(--bg-card);
  border-color: var(--accent-primary);
}

.ask-option-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all var(--transition-fast);
}

.ask-inline-option.selected .ask-option-checkbox {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.ask-option-content {
  flex: 1;
  min-width: 0;
}

.ask-inline-option-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.ask-inline-option-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.ask-custom-input {
  margin-top: 12px;
  margin-bottom: 16px;
}

.ask-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.ask-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.ask-input::placeholder {
  color: var(--text-muted);
}

.ask-inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .ask-inline {
    width: 100%;
  }

  .ask-inline-options {
    grid-template-columns: 1fr;
  }
}
</style>
