<template>
  <div class="input-area">
    <textarea
      ref="inputEl"
      v-model="input"
      @keydown.enter.exact.prevent="$emit('send')"
      @input="autoResize"
      :placeholder="placeholder"
      class="input"
      rows="1"
    ></textarea>
    <button v-if="isThinking" @click="$emit('queueOrStop')" class="btn" :class="input.trim() ? 'btn-primary' : 'btn-stop'">
      <SendHorizonal v-if="input.trim()" :size="20" />
      <Square v-else :size="20" />
    </button>
    <button v-else @click="$emit('send')" :disabled="!input.trim()" class="btn btn-primary">
      <SendHorizonal :size="20" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { SendHorizonal, Square } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
  isThinking: boolean
  placeholder: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  queueOrStop: []
}>()

const inputEl = ref<HTMLTextAreaElement>()
const input = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  input.value = val
})

watch(input, (val) => {
  emit('update:modelValue', val)
})

function autoResize() {
  if (!inputEl.value) return

  inputEl.value.style.height = 'auto'
  const lineHeight = parseInt(getComputedStyle(inputEl.value).lineHeight) || 20
  const maxHeight = lineHeight * 5

  if (inputEl.value.scrollHeight > maxHeight) {
    inputEl.value.style.height = `${maxHeight}px`
    inputEl.value.style.overflowY = 'auto'
  } else {
    inputEl.value.style.height = `${inputEl.value.scrollHeight}px`
    inputEl.value.style.overflowY = 'hidden'
  }
}
</script>

<style scoped>
.input-area {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  align-items: flex-end;
}

.input-area .input {
  flex: 1;
  resize: none;
  min-height: 44px;
  max-height: calc(1.5em * 5 + 16px);
  line-height: 1.5;
  padding: 10px 14px;
  font-family: inherit;
  font-size: inherit;
  overflow-y: hidden;
}

.input-area .btn {
  padding: 12px 20px;
  flex-shrink: 0;
}

.btn-stop {
  background: var(--status-error);
  border: none;
  color: white;
}

.btn-stop:hover {
  background: #dc2626;
  transform: scale(1.05);
}
</style>
