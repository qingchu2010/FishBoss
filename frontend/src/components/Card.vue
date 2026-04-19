<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <div class="card" :class="$props.class">
    <slot />
  </div>
</template>
