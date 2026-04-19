<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <h3 v-if="title" class="card-title">{{ title }}</h3>
  <slot />
</template>
