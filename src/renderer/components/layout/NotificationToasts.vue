<script setup lang="ts">
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-vue-next'
import { useUIStore, type NotificationLevel } from '@/stores/ui'

const uiStore = useUIStore()

const ICONS: Record<NotificationLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}
</script>

<template>
  <div
    class="toast-stack"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="n in uiStore.notifications"
        :key="n.id"
        class="toast"
        :class="`toast-${n.level}`"
      >
        <component
          :is="ICONS[n.level]"
          :size="16"
          class="toast-icon"
        />
        <span class="toast-message">{{ n.message }}</span>
        <button
          class="toast-close"
          title="Dismiss"
          aria-label="Dismiss notification"
          @click="uiStore.dismissNotification(n.id)"
        >
          <X :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: calc(var(--statusbar-height) + var(--space-3));
  right: var(--space-4);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: min(420px, calc(100vw - 2 * var(--space-4)));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-200);
  border: 1px solid var(--color-neutral-300);
  border-left: 3px solid var(--color-neutral-400);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  pointer-events: auto;
}

.toast-success { border-left-color: var(--color-success); }
.toast-warning { border-left-color: var(--color-warning); }
.toast-error { border-left-color: var(--color-error); }
.toast-info { border-left-color: var(--color-primary-400); }

.toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.toast-success .toast-icon { color: var(--color-success); }
.toast-warning .toast-icon { color: var(--color-warning); }
.toast-error .toast-icon { color: var(--color-error); }
.toast-info .toast-icon { color: var(--color-primary-400); }

.toast-message {
  flex: 1;
  line-height: var(--line-height-tight);
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  color: var(--color-neutral-400);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.toast-close:hover {
  color: var(--color-neutral-600);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
