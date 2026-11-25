<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ClipboardPaste, Download, MoreHorizontal, Plus, Search, Upload, Workflow } from 'lucide-vue-next'
import { useFlowsStore, type FlowState } from '@/stores/flows'
import { useFlowLibrary, looksLikeFlowText } from '@/composables/useFlowLibrary'
import { useDialogA11y } from '@/composables/useDialogA11y'

/**
 * The flow library: every saved flow, open as a tab or not. Open one with a click; share one with
 * Export / Copy JSON; bring flows in with Import or Paste. Closing a tab never deletes a flow, only
 * Delete here does.
 */
const flows = useFlowsStore()
const lib = useFlowLibrary()

const query = ref('')
const all = computed(() =>
  [...flows.mainFlows].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
)
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? all.value.filter((f) => f.name.toLowerCase().includes(q)) : all.value
})
const openCount = computed(() => flows.openFlows.length)

// Relative "edited" times, refreshed every half minute.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30000) })
onUnmounted(() => { if (clock) clearInterval(clock) })
function ago(d: Date | string): string {
  const s = Math.max(0, (now.value - +new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return new Date(d).toLocaleDateString()
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// ── Row menu ───────────────────────────────────────────────────────────────
const menuFor = ref<string | null>(null)
const menuPos = ref({ x: 0, y: 0 })
function openMenu(f: FlowState, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuPos.value = { x: Math.min(r.right - 180, window.innerWidth - 190), y: r.bottom + 4 }
  menuFor.value = menuFor.value === f.id ? null : f.id
}
function onDocPointer(e: PointerEvent) {
  if (menuFor.value && !(e.target as HTMLElement).closest('.lib-menu, .row-more')) menuFor.value = null
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape') menuFor.value = null }
onMounted(() => { document.addEventListener('pointerdown', onDocPointer); document.addEventListener('keydown', onDocKey) })
onUnmounted(() => { document.removeEventListener('pointerdown', onDocPointer); document.removeEventListener('keydown', onDocKey) })
const menuFlow = computed(() => (menuFor.value ? flows.getFlowById(menuFor.value) : undefined))
function act(fn: (id: string) => unknown) {
  const id = menuFor.value
  menuFor.value = null
  if (id) void fn(id)
}

// ── Rename (inline) ────────────────────────────────────────────────────────
const renaming = ref<string | null>(null)
const renameText = ref('')
function startRename(id: string) {
  renaming.value = id
  renameText.value = flows.getFlowById(id)?.name ?? ''
  nextTick(() => (document.querySelector('.rename-input') as HTMLInputElement | null)?.select())
}
async function commitRename() {
  const id = renaming.value
  renaming.value = null
  if (id) await lib.renameFlow(id, renameText.value)
}

// ── Delete (confirm) ───────────────────────────────────────────────────────
const deleting = ref<FlowState | null>(null)
const deleteRef = ref<HTMLElement | null>(null)
const { onKeydown: onDeleteKey } = useDialogA11y({ isOpen: () => !!deleting.value, container: deleteRef, onClose: () => { deleting.value = null } })
async function confirmDelete() {
  const f = deleting.value
  deleting.value = null
  if (f) await lib.deleteFlow(f.id)
}

// ── Paste JSON ─────────────────────────────────────────────────────────────
const pasting = ref(false)
const pasteText = ref('')
const pasteRef = ref<HTMLElement | null>(null)
const { onKeydown: onPasteKey } = useDialogA11y({ isOpen: () => pasting.value, container: pasteRef, onClose: () => { pasting.value = false } })
const pasteValid = computed(() => looksLikeFlowText(pasteText.value))
async function openPaste() {
  pasteText.value = ''
  pasting.value = true
  // Prefill from the clipboard when the browser allows it.
  try {
    const t = await navigator.clipboard.readText()
    if (looksLikeFlowText(t)) pasteText.value = t
  } catch { /* permission denied or unsupported: the user pastes into the box */ }
}
async function submitPaste() {
  if (!pasteValid.value) return
  const ok = await lib.importText(pasteText.value)
  if (ok) pasting.value = false
}
</script>

<template>
  <div class="flow-library">
    <div class="lib-actions">
      <button
        class="lib-btn primary"
        title="New flow"
        @click="lib.newFlow()"
      >
        <Plus :size="14" /> New
      </button>
      <button
        class="lib-btn"
        title="Import a .latch.json file (one flow or a whole project)"
        @click="lib.importFile()"
      >
        <Upload :size="14" /> Import
      </button>
      <button
        class="lib-btn"
        title="Paste flow JSON (you can also press ⌘V / Ctrl+V on the canvas)"
        @click="openPaste"
      >
        <ClipboardPaste :size="14" /> Paste
      </button>
    </div>

    <div class="search-wrapper">
      <Search class="search-icon" />
      <input
        v-model="query"
        type="text"
        class="search-input"
        placeholder="Search flows..."
        aria-label="Search flows"
      >
    </div>

    <ul
      class="lib-list"
      aria-label="Your flows"
    >
      <li
        v-for="f in shown"
        :key="f.id"
        class="lib-row"
        :class="{ active: f.id === flows.activeFlowId, closed: f.open === false }"
      >
        <input
          v-if="renaming === f.id"
          v-model="renameText"
          class="rename-input"
          aria-label="Flow name"
          @keydown.enter="commitRename"
          @keydown.escape="renaming = null"
          @blur="commitRename"
        >
        <button
          v-else
          class="row-main"
          :title="f.open === false ? 'Open in a tab' : 'Switch to this tab'"
          @click="lib.openFlow(f.id)"
          @dblclick="startRename(f.id)"
        >
          <Workflow
            :size="14"
            class="row-icon"
          />
          <span class="row-text">
            <span class="row-name">{{ f.name }}</span>
            <span class="row-meta">{{ plural(f.nodes.length, 'node') }} · {{ ago(f.updatedAt) }}</span>
          </span>
          <span
            v-if="f.id === flows.activeFlowId"
            class="row-badge now"
          >Editing</span>
          <span
            v-else-if="f.open !== false"
            class="row-badge"
          >Open</span>
        </button>
        <button
          class="row-more"
          :aria-label="`More actions for ${f.name}`"
          aria-haspopup="menu"
          :aria-expanded="menuFor === f.id"
          @click="openMenu(f, $event)"
        >
          <MoreHorizontal :size="14" />
        </button>
      </li>
      <li
        v-if="!shown.length"
        class="lib-empty"
      >
        {{ query ? 'No flows match.' : 'No flows yet. Make one with New, or Import / Paste one.' }}
      </li>
    </ul>

    <div class="lib-footer">
      <span>{{ plural(all.length, 'flow') }} · {{ openCount }} open</span>
      <button
        class="lib-btn ghost"
        title="Download every flow as one project file"
        :disabled="!all.length"
        @click="lib.exportAll()"
      >
        <Download :size="14" /> Export all
      </button>
    </div>

    <!-- Row menu -->
    <Teleport to="body">
      <div
        v-if="menuFlow"
        class="lib-menu"
        role="menu"
        :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
      >
        <button
          role="menuitem"
          @click="act(lib.openFlow)"
        >
          {{ menuFlow.open === false ? 'Open in a tab' : 'Switch to tab' }}
        </button>
        <button
          role="menuitem"
          @click="act(startRename)"
        >
          Rename
        </button>
        <button
          role="menuitem"
          @click="act(lib.duplicateFlow)"
        >
          Duplicate
        </button>
        <div class="menu-sep" />
        <button
          role="menuitem"
          @click="act(lib.exportFlow)"
        >
          Export flow file…
        </button>
        <button
          role="menuitem"
          @click="act(lib.copyFlowJson)"
        >
          Copy flow JSON
        </button>
        <div class="menu-sep" />
        <button
          v-if="menuFlow.open !== false"
          role="menuitem"
          @click="act(lib.closeFlow)"
        >
          Close tab
        </button>
        <button
          role="menuitem"
          class="danger"
          @click="act((id) => { deleting = flows.getFlowById(id) ?? null })"
        >
          Delete…
        </button>
      </div>
    </Teleport>

    <!-- Delete confirm -->
    <Teleport to="body">
      <div
        v-if="deleting"
        class="modal-overlay"
        @click.self="deleting = null"
        @keydown="onDeleteKey"
      >
        <div
          ref="deleteRef"
          class="lib-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lib-delete-title"
        >
          <h2 id="lib-delete-title">
            Delete “{{ deleting.name }}”?
          </h2>
          <p>It is removed from this browser for good. Export it first if you might want it back.</p>
          <div class="dialog-actions">
            <button
              class="btn btn-ghost"
              @click="lib.exportFlow(deleting.id)"
            >
              Export first
            </button>
            <button
              class="btn btn-ghost"
              data-autofocus
              @click="deleting = null"
            >
              Cancel
            </button>
            <button
              class="btn btn-danger"
              @click="confirmDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Paste JSON -->
    <Teleport to="body">
      <div
        v-if="pasting"
        class="modal-overlay"
        @click.self="pasting = false"
        @keydown="onPasteKey"
      >
        <div
          ref="pasteRef"
          class="lib-dialog wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lib-paste-title"
        >
          <h2 id="lib-paste-title">
            Paste a flow
          </h2>
          <p>Paste flow JSON (from Copy flow JSON, an exported file, or someone you are sharing with). It opens as a new tab.</p>
          <textarea
            v-model="pasteText"
            class="paste-box"
            spellcheck="false"
            placeholder="{ &quot;format&quot;: &quot;latch&quot;, … }"
            data-autofocus
          />
          <p
            v-if="pasteText && !pasteValid"
            class="paste-error"
          >
            That isn't LATCH flow JSON.
          </p>
          <div class="dialog-actions">
            <button
              class="btn btn-ghost"
              @click="pasting = false"
            >
              Cancel
            </button>
            <button
              class="btn btn-primary"
              :disabled="!pasteValid"
              @click="submitPaste"
            >
              Open flow
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.flow-library {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.lib-actions {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-3) 0;
}

.lib-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  border: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-0);
  color: var(--color-neutral-800);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.lib-btn:hover:not(:disabled) {
  background: var(--color-neutral-100);
}

.lib-btn.primary {
  background: var(--color-neutral-800);
  color: var(--color-neutral-0);
}

.lib-btn.primary:hover {
  background: var(--color-neutral-700);
}

.lib-btn.ghost {
  flex: 0 0 auto;
  border-color: var(--color-neutral-300);
}

.lib-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.search-wrapper {
  position: relative;
  padding: var(--space-3);
}

.search-icon {
  position: absolute;
  left: calc(var(--space-3) + 10px);
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--color-neutral-400);
}

.search-input {
  width: 100%;
  padding: var(--space-2) var(--space-2) var(--space-2) 32px;
  border: 1px solid var(--color-neutral-300);
  background: var(--color-neutral-50);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.lib-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0 var(--space-2) var(--space-2);
}

.lib-row {
  display: flex;
  align-items: stretch;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
}

.lib-row:hover {
  background: var(--color-neutral-50);
  border-color: var(--color-neutral-200);
}

.lib-row.active {
  background: var(--color-primary-50, #ecfdf5);
  border-color: var(--color-primary-200, #a7f3d0);
}

.row-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding: var(--space-2);
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.row-icon {
  flex-shrink: 0;
  color: var(--color-neutral-400);
}

.lib-row.closed .row-icon {
  opacity: 0.5;
}

.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.row-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lib-row.closed .row-name {
  color: var(--color-neutral-600);
}

.row-meta {
  font-size: 10px;
  color: var(--color-neutral-500);
  font-family: var(--font-mono);
}

.row-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border: 1px solid var(--color-neutral-300);
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--color-neutral-600);
}

.row-badge.now {
  border-color: var(--color-primary-500);
  color: var(--color-primary-700);
}

.row-more {
  flex-shrink: 0;
  width: 28px;
  border: none;
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
}

.row-more:hover {
  color: var(--color-neutral-800);
}

.rename-input {
  flex: 1;
  margin: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 2px solid var(--color-primary-500);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.lib-empty {
  padding: var(--space-4) var(--space-2);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-500);
}

.lib-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-neutral-200);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-neutral-500);
}

.lib-menu {
  position: fixed;
  z-index: 1500;
  min-width: 180px;
  padding: var(--space-1) 0;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.lib-menu button {
  display: block;
  width: 100%;
  padding: var(--space-1) var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-800);
  cursor: pointer;
}

.lib-menu button:hover,
.lib-menu button:focus-visible {
  background: var(--color-neutral-100);
}

.lib-menu button.danger {
  color: var(--color-error-600);
}

.menu-sep {
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--color-neutral-200);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.lib-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: var(--space-4);
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
}

.lib-dialog.wide {
  width: min(560px, calc(100vw - 32px));
}

.lib-dialog h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.lib-dialog p {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}

.paste-box {
  width: 100%;
  height: 200px;
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-300);
  font-family: var(--font-mono);
  font-size: 11px;
  resize: vertical;
}

.paste-error {
  color: var(--color-error-600) !important;
  margin-top: var(--space-1) !important;
}

/* Danger button for the delete confirm (no shared .btn-danger in components.css). */
.btn-danger {
  background: var(--color-error-600);
  border-color: var(--color-error-600);
  color: var(--color-neutral-0);
}

.btn-danger:hover {
  filter: brightness(1.1);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
