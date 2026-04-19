<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="card-header">
    <h3 v-if="title" class="card-title">{{ title }}</h3>
    <p v-if="description" class="card-description">{{ description }}</p>
    <slot />
  </div>
</template>
