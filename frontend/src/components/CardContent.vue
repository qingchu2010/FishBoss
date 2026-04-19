<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <div class="card-content" :class="$props.class">
    <slot />
  </div>
</template>
