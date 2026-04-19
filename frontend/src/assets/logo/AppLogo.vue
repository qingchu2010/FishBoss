<script setup lang="ts">
</script>

<template>
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--accent-primary)" />
        <stop offset="50%" stop-color="var(--accent-secondary)" />
        <stop offset="100%" stop-color="var(--accent-tertiary)" />
      </linearGradient>
      <linearGradient id="crownGradient" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="var(--accent-primary)" />
        <stop offset="100%" stop-color="var(--accent-tertiary)" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#glow)">
      <path d="M28 62C28 62 38 42 55 42C72 42 78 52 78 62C78 72 72 80 55 80C38 80 28 72 28 62Z" fill="url(#logoGradient)" opacity="0.9" />
      <path d="M78 62L92 52L87 62L92 72L78 62Z" fill="url(#logoGradient)" opacity="0.85" />
      <ellipse cx="43" cy="59" rx="4" ry="5" fill="var(--bg-primary)" />
      <circle cx="44" cy="58" r="2" fill="var(--text-primary)" />
    </g>
  </svg>
</template>
