<script setup lang="ts">
defineProps<{
  description?: string
}>()
</script>

<template>
  <p v-if="description" class="card-description">{{ description }}</p>
  <slot />
</template>
