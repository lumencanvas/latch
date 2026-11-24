<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ShieldAlert } from 'lucide-vue-next'
import { useDialogA11y } from '@/composables/useDialogA11y'
import {
  setImportTrustResolver,
  resetImportTrustResolver,
  type FlowTrustSummary,
  type ImportTrustDecision,
} from '@/services/security/flowTrust'

/**
 * Import trust prompt — shown before a flow FILE carrying executable code
 * (Function / Expression nodes) is imported. Registers itself as the
 * flowTrust resolver on mount; the safe choice ("open with code disabled") is
 * focused by default, Escape cancels the import.
 */
const summary = ref<FlowTrustSummary | null>(null)
let pending: ((d: ImportTrustDecision) => void) | null = null

const isOpen = computed(() => summary.value !== null)
const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => isOpen.value,
  container: dialogRef,
  onClose: () => decide('cancel'),
})

const MAX_LISTED = 8
const listed = computed(() => summary.value?.codeNodes.slice(0, MAX_LISTED) ?? [])
const hiddenCount = computed(() => Math.max(0, (summary.value?.codeNodes.length ?? 0) - MAX_LISTED))

function decide(d: ImportTrustDecision) {
  const resolve = pending
  pending = null
  summary.value = null
  resolve?.(d)
}

onMounted(() => {
  setImportTrustResolver((s) => new Promise<ImportTrustDecision>((resolve) => {
    // A second import while one prompt is open: cancel the stale one (fail closed).
    pending?.('cancel')
    pending = resolve
    summary.value = s
  }))
})

onUnmounted(() => {
  pending?.('cancel')
  pending = null
  resetImportTrustResolver()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="summary"
      class="modal-overlay"
      @keydown="onKeydown"
    >
      <div
        ref="dialogRef"
        class="modal-container"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-trust-title"
        aria-describedby="import-trust-desc"
      >
        <div class="modal-header">
          <ShieldAlert :size="18" />
          <h2
            id="import-trust-title"
            class="modal-title"
          >
            This file contains code
          </h2>
        </div>

        <div class="modal-body">
          <p
            id="import-trust-desc"
            class="lead"
          >
            {{ summary.codeNodes.length }} node{{ summary.codeNodes.length === 1 ? '' : 's' }} in this
            file run JavaScript on your machine. LATCH restricts some browser features for node code,
            but this is not a full sandbox. Only run code from people you trust.
          </p>

          <ul class="code-list">
            <li
              v-for="n in listed"
              :key="n.flowName + n.nodeId"
              class="code-item"
            >
              <span class="code-what"><strong>{{ n.type }}</strong> in “{{ n.flowName }}” {{ n.what }}</span>
              <code
                v-if="n.preview"
                class="code-preview"
              >{{ n.preview }}</code>
            </li>
            <li
              v-if="hiddenCount"
              class="code-more"
            >
              …and {{ hiddenCount }} more
            </li>
          </ul>

          <template v-if="summary.capabilities.length">
            <h3 class="section-title">
              This flow can also
            </h3>
            <ul class="cap-list">
              <li
                v-for="c in summary.capabilities"
                :key="c"
              >
                {{ c }}
              </li>
            </ul>
          </template>

          <p class="hint">
            With code disabled, the flow opens normally and code nodes stay off until you
            review them and click <em>Enable code</em> (or edit their code).
          </p>
        </div>

        <div class="modal-actions">
          <button
            class="btn btn-ghost"
            @click="decide('cancel')"
          >
            Cancel
          </button>
          <button
            class="btn btn-secondary"
            @click="decide('trust')"
          >
            Trust and run
          </button>
          <button
            class="btn btn-primary"
            data-autofocus
            @click="decide('disable')"
          >
            Open with code disabled
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
}

.modal-container {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 6px 6px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
  color: var(--color-neutral-800);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-50);
}

.modal-title {
  margin: 0;
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.lead { margin: 0 0 var(--space-3) 0; }

.code-list,
.cap-list {
  margin: 0 0 var(--space-3) 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.code-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-300);
  background: var(--color-neutral-50);
}

.code-preview {
  display: block;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 11px;
  color: var(--color-neutral-700);
}

.code-more { color: var(--color-neutral-600); }

.cap-list li::before { content: '• '; }

.section-title {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-600);
}

.hint {
  margin: 0;
  color: var(--color-neutral-600);
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 2px solid var(--color-neutral-800);
}

.btn {
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  cursor: pointer;
  border: 2px solid var(--color-neutral-800);
}

.btn:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.btn-primary {
  background: var(--color-neutral-800);
  color: var(--color-neutral-0);
}

.btn-secondary {
  background: var(--color-neutral-0);
  color: var(--color-neutral-800);
}

.btn-ghost {
  background: none;
  border-color: transparent;
  color: var(--color-neutral-600);
}

.btn:hover { filter: brightness(1.1); }
</style>
