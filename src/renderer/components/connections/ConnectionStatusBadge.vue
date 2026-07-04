<script setup lang="ts">
/**
 * ConnectionStatusBadge
 *
 * A small, reusable status indicator dot for connection status. The colour is
 * carried by `data-status` (scoped CSS below); `error` is additionally drawn as
 * a soft square so the status is distinguishable without relying on hue alone
 * (WCAG 1.4.1). `role="img"` + `aria-label` name it for assistive tech.
 *
 * NB: an earlier version styled this with Tailwind utility classes, but this
 * project ships no Tailwind — those classes were inert and the badge never
 * rendered. Styling now lives in the scoped block below.
 */

import { computed } from 'vue'
import type { ConnectionStatus } from '@/services/connections/types'

const props = withDefaults(
  defineProps<{
    /** Connection status */
    status: ConnectionStatus
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Whether to show pulse animation for connecting states */
    pulse?: boolean
    /** Optional label to show on hover / announce */
    label?: string
  }>(),
  {
    size: 'md',
    pulse: true,
  }
)

const statusLabels: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
  disconnected: 'Disconnected',
  error: 'Error',
}

const accessibleLabel = computed(() => props.label || statusLabels[props.status])

const shouldPulse = computed(() => {
  return props.pulse && (props.status === 'connecting' || props.status === 'reconnecting')
})
</script>

<template>
  <span
    class="status-badge"
    :class="[`status-badge--${props.size}`, { 'status-badge--pulse': shouldPulse }]"
    role="img"
    :aria-label="accessibleLabel"
    :data-status="props.status"
    :title="accessibleLabel"
  />
</template>

<style scoped>
.status-badge {
  display: inline-block;
  flex: none;
  border-radius: 999px; /* circle by default */
  background: var(--color-neutral-400);
}

/* Sizes */
.status-badge--sm {
  width: 6px;
  height: 6px;
}
.status-badge--md {
  width: 8px;
  height: 8px;
}
.status-badge--lg {
  width: 12px;
  height: 12px;
}

/* Status colours */
.status-badge[data-status='connected'] {
  background: var(--color-success);
}
.status-badge[data-status='connecting'],
.status-badge[data-status='reconnecting'] {
  background: var(--color-warning);
}
.status-badge[data-status='disconnected'] {
  background: var(--color-neutral-400);
}
.status-badge[data-status='error'] {
  background: var(--color-error);
  /* Non-color cue (WCAG 1.4.1): error is the only non-circular badge, so the
     critical green/red pair is distinguishable without relying on hue. */
  border-radius: 2px;
}

/* Pulse for the transient (re)connecting states */
.status-badge--pulse {
  animation: status-badge-pulse 1.2s ease-in-out infinite;
}

@keyframes status-badge-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
