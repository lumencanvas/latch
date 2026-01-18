<script setup lang="ts">
defineProps<{
  size?: number
  variant?: 'dark' | 'light'  // dark = cream strokes for dark bg, light = dark strokes for light bg
}>()
</script>

<template>
  <svg
    :width="size ?? 40"
    :height="size ?? 40"
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="latch-logo"
  >
    <!-- Left bracket -->
    <path
      d="M 50 35 L 25 35 Q 15 35 15 45 L 15 155 Q 15 165 25 165 L 50 165"
      fill="none"
      :stroke="variant === 'dark' ? '#f5f2eb' : '#2a2a2a'"
      stroke-width="12"
      stroke-linecap="round"
    />

    <!-- Right bracket -->
    <path
      d="M 150 35 L 175 35 Q 185 35 185 45 L 185 155 Q 185 165 175 165 L 150 165"
      fill="none"
      :stroke="variant === 'dark' ? '#f5f2eb' : '#2a2a2a'"
      stroke-width="12"
      stroke-linecap="round"
    />

    <!-- Horizontal flow lines -->
    <line
      x1="50"
      y1="75"
      x2="150"
      y2="75"
      :stroke="variant === 'dark' ? '#f5f2eb' : '#2a2a2a'"
      stroke-width="4"
    />
    <line
      x1="50"
      y1="125"
      x2="150"
      y2="125"
      :stroke="variant === 'dark' ? '#f5f2eb' : '#2a2a2a'"
      stroke-width="4"
    />

    <!-- Diagonal latch bar -->
    <line
      x1="65"
      y1="115"
      x2="135"
      y2="85"
      :stroke="variant === 'dark' ? '#f5f2eb' : '#2a2a2a'"
      stroke-width="8"
      stroke-linecap="round"
    />

    <!-- Orange accent at pivot point -->
    <rect
      x="58"
      y="108"
      width="18"
      height="14"
      rx="3"
      fill="#e85d3b"
    />

    <!-- Catch point on right -->
    <rect
      x="130"
      y="80"
      width="14"
      height="10"
      rx="2"
      fill="#e85d3b"
    />
  </svg>
</template>

<style scoped>
.latch-logo {
  display: block;
}
</style>
