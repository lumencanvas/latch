<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Bot } from 'lucide-vue-next'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { setAgentConsentResolver } from '@/services/agentTools'
import type { ConsentDecision, ConsentRequest, ToolTier } from '@/services/agentTools/types'

/**
 * Asks the person before an AI agent does something that needs their say: changing the flow
 * (in "Ask before changes" mode), playing it, reading the output image, importing JSON.
 * Registers itself as the agent consent resolver; with it unmounted every request is denied.
 * Requests queue and are shown one at a time. Escape denies.
 */
interface Pending { req: ConsentRequest; resolve: (d: ConsentDecision) => void }
const queue = ref<Pending[]>([])
const current = computed(() => queue.value[0]?.req ?? null)
const isOpen = computed(() => current.value !== null)
const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => isOpen.value,
  container: dialogRef,
  onClose: () => decide('deny'),
})

const WHAT: Record<ToolTier, string> = {
  read: 'read the flow',
  'sensitive-read': 'see what Main Output shows (it may include your camera or screen) or list your saved connections',
  edit: 'change the open flow: add, wire and remove nodes and set controls. Each change can be undone',
  run: 'play, pause or stop the flow. Playing runs every node in it, including camera, microphone, network and hardware nodes',
  consequential: 'open flow JSON it supplies as new tabs',
}

const VIA: Record<ConsentRequest['transport'], string> = {
  webmcp: 'An AI agent connected to this tab',
  relay: 'A desktop AI agent',
  test: 'A test',
}

function decide(d: ConsentDecision) {
  const p = queue.value.shift()
  p?.resolve(d)
}

onMounted(() => {
  setAgentConsentResolver((req) => new Promise<ConsentDecision>((resolve) => {
    // Waiting requests beyond a handful are denied: an agent spamming prompts must not pile up dialogs.
    if (queue.value.length >= 5) { resolve('deny'); return }
    queue.value.push({ req, resolve })
  }))
})

onUnmounted(() => {
  for (const p of queue.value) p.resolve('deny')
  queue.value = []
  setAgentConsentResolver(null)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="current"
      class="modal-overlay"
      @keydown="onKeydown"
    >
      <div
        ref="dialogRef"
        class="modal-container"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="agent-consent-title"
        aria-describedby="agent-consent-desc"
      >
        <div class="modal-header">
          <Bot :size="18" />
          <h2
            id="agent-consent-title"
            class="modal-title"
          >
            Allow the AI agent?
          </h2>
        </div>

        <div class="modal-body">
          <p
            id="agent-consent-desc"
            class="lead"
          >
            {{ VIA[current.transport] }} wants to <strong>{{ current.title.toLowerCase() }}</strong>.
            This lets it {{ WHAT[current.tier] }}.
          </p>
          <code class="args">{{ current.args }}</code>
          <p
            v-if="current.scope === 'session'"
            class="hint"
          >
            “For this session” covers this kind of action until you turn agent access off or close the tab.
          </p>
          <p
            v-if="queue.length > 1"
            class="hint"
          >
            {{ queue.length - 1 }} more request{{ queue.length === 2 ? '' : 's' }} waiting.
          </p>
        </div>

        <div class="modal-actions">
          <button
            class="btn btn-ghost"
            @click="decide('deny')"
          >
            Deny
          </button>
          <button
            class="btn"
            :class="current.scope === 'session' ? 'btn-secondary' : 'btn-primary'"
            data-autofocus
            @click="decide('once')"
          >
            Allow once
          </button>
          <button
            v-if="current.scope === 'session'"
            class="btn btn-primary"
            @click="decide('session')"
          >
            Allow for this session
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
  max-width: 520px;
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

.args {
  display: block;
  margin: 0 0 var(--space-3) 0;
  padding: var(--space-2);
  max-height: 140px;
  overflow: auto;
  border: 1px solid var(--color-neutral-300);
  background: var(--color-neutral-50);
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-neutral-700);
}

.hint {
  margin: 0 0 var(--space-2) 0;
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
