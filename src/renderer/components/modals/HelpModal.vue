<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, HelpCircle, MousePointerClick, Cable, Play, ExternalLink } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useDialogA11y } from '@/composables/useDialogA11y'

const uiStore = useUIStore()

const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => uiStore.helpOpen,
  container: dialogRef,
  onClose: close,
})

function close() {
  uiStore.closeHelp()
}

// Show the platform-correct modifier glyph so the cheat sheet matches the real bindings.
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
const mod = isMac ? '⌘' : 'Ctrl'

const quickstart = [
  { icon: MousePointerClick, title: 'Add a node', text: 'Drag one from the sidebar, or open the node library (the Boxes icon in the header) and pick.' },
  { icon: Cable, title: 'Wire it up', text: 'Drag from an output port to another node’s input — or focus a node and press W to wire with the keyboard.' },
  { icon: Play, title: 'Press Play', text: 'Hit the ▶ button in the header to run your graph. Stop resets it.' },
]

// Mirrors the real handlers: EditorView.handleKeyDown + useCanvasKeyboard.
const groups = computed(() => [
  {
    title: 'Editing',
    rows: [
      { keys: [mod, 'Z'], label: 'Undo' },
      { keys: [mod, 'Shift', 'Z'], label: 'Redo' },
      { keys: [mod, 'A'], label: 'Select all' },
      { keys: [mod, 'C'], label: 'Copy' },
      { keys: [mod, 'X'], label: 'Cut' },
      { keys: [mod, 'V'], label: 'Paste' },
      { keys: [mod, 'D'], label: 'Duplicate' },
      { keys: ['Del'], label: 'Delete selected' },
    ],
  },
  {
    title: 'Subflows',
    rows: [
      { keys: [mod, 'G'], label: 'Group selection into a subflow' },
      { keys: [mod, 'E'], label: 'Edit the selected subflow' },
      { keys: [mod, 'Shift', 'G'], label: 'Unpack the selected subflow' },
    ],
  },
  {
    title: 'Canvas (keyboard)',
    rows: [
      { keys: ['↑', '↓', '←', '→'], label: 'Browse nodes (or move the selected node)' },
      { keys: ['Enter'], label: 'Select focused node (Shift to add)' },
      { keys: ['W'], label: 'Start wiring from the focused node' },
      { keys: ['Esc'], label: 'Clear selection / cancel wiring' },
    ],
  },
])
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="uiStore.helpOpen"
        class="modal-overlay"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
        >
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <HelpCircle :size="18" />
              <h2
                id="help-modal-title"
                class="modal-title"
              >
                HELP &amp; SHORTCUTS
              </h2>
            </div>
            <button
              class="close-btn"
              aria-label="Close help"
              data-autofocus
              @click="close"
            >
              <X :size="16" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Quickstart -->
            <section class="qs">
              <h3 class="section-title">
                Quickstart
              </h3>
              <ol class="qs-steps">
                <li
                  v-for="(step, i) in quickstart"
                  :key="i"
                  class="qs-step"
                >
                  <span class="qs-num">{{ i + 1 }}</span>
                  <component
                    :is="step.icon"
                    :size="18"
                    class="qs-icon"
                  />
                  <div class="qs-text">
                    <p class="qs-step-title">
                      {{ step.title }}
                    </p>
                    <p class="qs-step-desc">
                      {{ step.text }}
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <!-- Shortcuts -->
            <section
              v-for="group in groups"
              :key="group.title"
              class="shortcuts"
            >
              <h3 class="section-title">
                {{ group.title }}
              </h3>
              <ul class="shortcut-list">
                <li
                  v-for="row in group.rows"
                  :key="row.label"
                  class="shortcut-row"
                >
                  <span class="shortcut-keys">
                    <kbd
                      v-for="k in row.keys"
                      :key="k"
                    >{{ k }}</kbd>
                  </span>
                  <span class="shortcut-label">{{ row.label }}</span>
                </li>
              </ul>
            </section>

            <!-- Docs -->
            <a
              class="docs-link"
              href="https://latch.design"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink :size="14" />
              <span>Full docs &amp; guides at latch.design</span>
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

.modal-container {
  width: 90vw;
  max-width: 620px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 6px 6px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-50);
  color: var(--color-neutral-800);
}
.modal-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.modal-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  margin: 0;
}
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
  color: var(--color-neutral-600);
}
.close-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-800);
}
.close-btn:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  color: var(--color-neutral-800);
}

.section-title {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-600);
}

/* Quickstart */
.qs { margin-bottom: var(--space-5); }
.qs-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.qs-step {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: start;
  gap: var(--space-2);
}
.qs-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--color-primary-500);
  color: var(--color-neutral-0);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}
.qs-icon {
  color: var(--color-protocol-ble);
  margin-top: 1px;
}
.qs-text { min-width: 0; }
.qs-step-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}
.qs-step-desc {
  margin: 2px 0 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  line-height: 1.45;
}

/* Shortcuts */
.shortcuts { margin-bottom: var(--space-4); }
.shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 3px 0;
}
.shortcut-keys {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 120px;
}
kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  border-bottom-width: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-neutral-800);
}
.shortcut-label {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-700);
}

/* Docs */
.docs-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--color-neutral-300);
  color: var(--color-neutral-700);
  font-size: var(--font-size-xs);
  text-decoration: none;
}
.docs-link:hover {
  border-color: var(--color-neutral-400);
  color: var(--color-neutral-900);
}
.docs-link:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

/* Transitions (match the app's modal shell) */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-container {
  transform: translateY(20px);
}
.modal-leave-to .modal-container {
  transform: translateY(20px);
}
</style>
