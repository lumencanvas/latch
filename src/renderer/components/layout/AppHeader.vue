<script setup lang="ts">
import { computed, inject, ref, onMounted, onUnmounted } from 'vue'
import { isElectron } from '@/utils/platform'
import { APP_VERSION } from '@/version'
import { useRoute, useRouter } from 'vue-router'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'
import { useUIStore } from '@/stores/ui'
import {
  Play,
  Pause,
  Square,
  Save,
  Boxes,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Sliders,
  Code2,
  Brain,
  Plug,
  Bluetooth,
  Github,
  Undo2,
  Redo2,
  HelpCircle,
  GraduationCap,
  MoreHorizontal,
  Workflow,
} from 'lucide-vue-next'
import LatchLogo from '@/components/branding/LatchLogo.vue'
import { aiInference } from '@/services/ai/AIInference'
import { useConnectionsStore } from '@/stores/connections'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { usePersistence } from '@/composables/usePersistence'

const route = useRoute()
const router = useRouter()
const flowsStore = useFlowsStore()
const runtimeStore = useRuntimeStore()
const uiStore = useUIStore()
const connectionsStore = useConnectionsStore()
const { saveAllFlows } = usePersistence()

// History for undo/redo
const { canUndo, canRedo, undo, redo, undoDescription, redoDescription } = useFlowHistory()

// Track if AI models are loaded
const hasLoadedModels = ref(false)
let aiUnsubscribe: (() => void) | null = null

onMounted(() => {
  updateAIStatus()
  aiUnsubscribe = aiInference.subscribe(() => {
    updateAIStatus()
  })
})

onUnmounted(() => {
  aiUnsubscribe?.()
})

function updateAIStatus() {
  const state = aiInference.getState()
  hasLoadedModels.value = state.loadedModels.size > 0
}

// Check current view
const isEditorView = computed(() => route.name === 'editor')
const isControlPanelView = computed(() => route.name === 'controls')

// Navigate between views
function goToEditor() {
  router.push({ name: 'editor' })
}

function goToControlPanel() {
  router.push({ name: 'controls' })
}

// Inject execution engine controls from EditorView
const executionControls = inject<{
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  toggle: () => void
}>('executionControls')

const flowName = computed(() => flowsStore.activeFlow?.name ?? 'No Flow')
const isDirty = computed(() => flowsStore.hasUnsavedChanges)
const isRunning = computed(() => runtimeStore.isRunning)
// Nothing to run on an empty graph — guard Play so it can't report "RUNNING · 60 fps"
// with zero nodes executing.
const canRun = computed(() => flowsStore.activeNodes.length > 0)

function toggleSidebar() {
  uiStore.toggleSidebar()
}

function togglePlayback() {
  if (executionControls) {
    executionControls.toggle()
  }
}

function stop() {
  if (executionControls) {
    executionControls.stop()
  }
}

function togglePropertiesPanel() {
  uiStore.togglePropertiesPanel()
}

function openAIModelManager() {
  uiStore.openAIModelManager()
}

function openConnectionManager() {
  connectionsStore.openModal()
}

// Import / export / share live in the Flows library (the Flows button); Save keeps everything in
// this browser.

async function saveProject() {
  await saveAllFlows()
  uiStore.notify('All flows saved in this browser. Use Export to make a file you can share.', 'success')
}

function openFlowLibrary() {
  uiStore.openSidebarTab('flows')
}

/** The Flows button opens the library panel, or closes the sidebar if it's already showing. */
function toggleFlowLibrary() {
  if (uiStore.sidebarOpen && uiStore.sidebarTab === 'flows') uiStore.toggleSidebar()
  else uiStore.openSidebarTab('flows')
}

function openGitHub() {
  window.open('https://github.com/lumencanvas/latch', '_blank')
}

// Narrow screens: the secondary actions fold into a "More" menu (see the media queries).
const moreOpen = ref(false)
const moreRef = ref<HTMLElement | null>(null)
function runMore(action: () => unknown) {
  moreOpen.value = false
  void action()
}
function onDocPointer(e: PointerEvent) {
  if (moreOpen.value && moreRef.value && !moreRef.value.contains(e.target as Node)) moreOpen.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') moreOpen.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onDocKey)
})

// Detect macOS Electron for traffic light padding
const isMacElectron = computed(() => {
  return isElectron() && window.electronAPI?.platform === 'darwin'
})
</script>

<template>
  <header
    class="app-header"
    :class="{ 'mac-electron': isMacElectron }"
  >
    <div class="header-left">
      <button
        class="btn btn-icon btn-ghost header-sidebar-toggle"
        :title="uiStore.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
        :aria-label="uiStore.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
        @click="toggleSidebar"
      >
        <PanelLeftClose v-if="uiStore.sidebarOpen" />
        <PanelLeft v-else />
      </button>

      <div class="header-brand">
        <LatchLogo
          :size="24"
          variant="dark"
          class="brand-icon"
        />
        <span class="brand-title">LATCH</span>
      </div>

      <span class="header-divider" />

      <span class="header-flow-name">
        {{ flowName }}
        <span
          v-if="isDirty"
          class="dirty-indicator"
        >*</span>
      </span>
    </div>

    <div class="header-center">
      <div class="history-controls">
        <button
          class="btn btn-icon btn-ghost"
          :disabled="!canUndo"
          :title="undoDescription ? `Undo: ${undoDescription}` : 'Undo (Ctrl+Z)'"
          aria-label="Undo"
          @click="undo"
        >
          <Undo2 />
        </button>
        <button
          class="btn btn-icon btn-ghost"
          :disabled="!canRedo"
          :title="redoDescription ? `Redo: ${redoDescription}` : 'Redo (Ctrl+Shift+Z)'"
          aria-label="Redo"
          @click="redo"
        >
          <Redo2 />
        </button>
      </div>

      <span class="header-divider" />

      <div class="playback-controls">
        <button
          class="btn btn-icon"
          :class="isRunning ? 'btn-primary' : canRun ? 'btn-play' : 'btn-secondary'"
          :disabled="!isRunning && !canRun"
          :title="isRunning ? 'Pause' : canRun ? 'Play' : 'Add nodes to run'"
          :aria-label="isRunning ? 'Pause' : canRun ? 'Play' : 'Play (add nodes to run)'"
          @click="togglePlayback"
        >
          <Pause v-if="isRunning" />
          <Play v-else />
        </button>

        <button
          class="btn btn-icon btn-secondary"
          :disabled="runtimeStore.isStopped"
          title="Stop"
          aria-label="Stop"
          @click="stop"
        >
          <Square />
        </button>
      </div>

      <span class="header-divider" />

      <div class="view-switcher">
        <button
          class="btn btn-sm view-btn"
          :class="{ active: isEditorView }"
          title="Editor View"
          @click="goToEditor"
        >
          <Code2 />
          <span>Editor</span>
        </button>
        <button
          class="btn btn-sm view-btn"
          :class="{ active: isControlPanelView }"
          title="Control Panel"
          @click="goToControlPanel"
        >
          <Sliders />
          <span>Controls</span>
        </button>
      </div>
    </div>

    <div class="header-right">
      <button
        v-if="isEditorView"
        class="btn btn-icon btn-ghost header-panel-toggle"
        :title="uiStore.propertiesPanelOpen ? 'Hide properties' : 'Show properties'"
        :aria-label="uiStore.propertiesPanelOpen ? 'Hide properties' : 'Show properties'"
        @click="togglePropertiesPanel"
      >
        <PanelRightClose v-if="uiStore.propertiesPanelOpen" />
        <PanelRight v-else />
      </button>

      <span
        v-if="isEditorView"
        class="header-divider"
      />

      <!-- AI Button: Full text when no models loaded, icon only when loaded -->
      <button
        v-if="!hasLoadedModels"
        class="btn ai-load-btn header-ai"
        title="Load Local AI Models"
        @click="openAIModelManager"
      >
        <Brain :size="16" />
        <span class="ai-load-label">Load Local AI</span>
      </button>
      <button
        v-else
        class="btn btn-icon ai-btn-loaded header-ai"
        title="AI Model Manager"
        aria-label="AI Model Manager"
        @click="openAIModelManager"
      >
        <Brain />
      </button>

      <button
        class="btn btn-ghost header-examples header-flows"
        :class="{ active: uiStore.sidebarOpen && uiStore.sidebarTab === 'flows' }"
        title="Your flows: open, import, export, share or paste a flow"
        aria-label="Your flows"
        @click="toggleFlowLibrary"
      >
        <Workflow />
        <span class="header-examples-label">Flows</span>
      </button>

      <button
        class="btn btn-ghost header-examples"
        title="Example flows: ready-made patches to open and remix"
        aria-label="Example flows"
        @click="uiStore.openNodeExplorer('snippets')"
      >
        <GraduationCap />
        <span class="header-examples-label">Examples</span>
      </button>

      <div class="header-secondary">
        <button
          class="btn btn-icon btn-ghost connections-btn"
          :class="{ 'has-connections': connectionsStore.connections.length > 0 }"
          title="Connection Manager"
          aria-label="Connection Manager"
          @click="openConnectionManager"
        >
          <Plug />
        </button>

        <button
          class="btn btn-icon btn-ghost"
          title="Add Bluetooth Device"
          aria-label="Add Bluetooth Device"
          @click="uiStore.openBluetoothDeviceManager()"
        >
          <Bluetooth />
        </button>

        <span class="header-divider" />

        <button
          class="btn btn-icon btn-ghost"
          title="Save all flows (in this browser)"
          aria-label="Save all flows"
          @click="saveProject"
        >
          <Save />
        </button>
        <button
          class="btn btn-icon btn-ghost"
          title="Node Explorer"
          aria-label="Node Explorer"
          @click="uiStore.openNodeExplorer('nodes')"
        >
          <Boxes />
        </button>

        <button
          class="btn btn-icon btn-ghost"
          title="Help & keyboard shortcuts (?)"
          aria-label="Help and keyboard shortcuts"
          @click="uiStore.openHelp()"
        >
          <HelpCircle />
        </button>

        <button
          class="btn btn-icon btn-ghost github-btn"
          title="View on GitHub"
          aria-label="View on GitHub"
          @click="openGitHub"
        >
          <Github :size="16" />
        </button>

        <span class="header-version">v{{ APP_VERSION }}</span>
      </div>

      <div
        ref="moreRef"
        class="header-more"
      >
        <button
          class="btn btn-icon btn-ghost"
          title="More"
          aria-label="More actions"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          <MoreHorizontal />
        </button>
        <div
          v-if="moreOpen"
          class="more-menu"
          role="menu"
        >
          <button
            role="menuitem"
            class="more-item more-ai"
            @click="runMore(openAIModelManager)"
          >
            <Brain /> AI Models
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(openConnectionManager)"
          >
            <Plug /> Connections
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(() => uiStore.openBluetoothDeviceManager())"
          >
            <Bluetooth /> Bluetooth Device
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(saveProject)"
          >
            <Save /> Save All Flows
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(openFlowLibrary)"
          >
            <Workflow /> Flows (open, import, export)
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(() => uiStore.openNodeExplorer('nodes'))"
          >
            <Boxes /> Node Explorer
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(() => uiStore.openHelp())"
          >
            <HelpCircle /> Help &amp; Shortcuts
          </button>
          <button
            role="menuitem"
            class="more-item"
            @click="runMore(openGitHub)"
          >
            <Github :size="16" /> GitHub
          </button>
          <span class="more-version">LATCH v{{ APP_VERSION }}</span>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-examples {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.header-flows.active {
  background: var(--color-primary-100);
  color: var(--color-primary-700);
}

.header-examples svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.header-secondary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-more {
  position: relative;
  display: none;
}

.more-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  padding: var(--space-1);
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}

.more-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font: inherit;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-200);
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.more-item:hover,
.more-item:focus-visible {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.more-item svg {
  width: 16px;
  height: 16px;
}

.more-ai {
  display: none;
}

.more-version {
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  border-top: 1px solid var(--color-neutral-700);
  margin-top: var(--space-1);
}


.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--space-4);
  background: var(--color-neutral-800);
  color: var(--color-neutral-0);
  gap: var(--space-4);
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.app-header :deep(button),
.app-header :deep(a),
.app-header :deep(input),
.app-header :deep(select) {
  -webkit-app-region: no-drag;
}

.app-header.mac-electron {
  padding-left: 80px;
}

.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-left {
  flex: 1;
}

.header-right {
  flex: 1;
  justify-content: flex-end;
}

.header-sidebar-toggle {
  color: var(--color-neutral-400);
}

.header-sidebar-toggle:hover,
.header-panel-toggle:hover {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.header-panel-toggle {
  color: var(--color-neutral-400);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.brand-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.header-divider {
  width: 1px;
  height: 20px;
  background: var(--color-neutral-600);
  margin: 0 var(--space-2);
}

.header-flow-name {
  max-width: 220px;
  overflow: hidden;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-300);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dirty-indicator {
  color: var(--color-warning);
  margin-left: var(--space-1);
}

.playback-controls {
  display: flex;
  gap: var(--space-2);
}

/* Stopped-but-ready Play reads as the obvious "go live" action (was a neutral grey btn-secondary). */
.playback-controls .btn-play {
  background: var(--color-success-700); /* white icon needs ≥3:1 — #22C55E was 2.3:1 */
  color: #fff;
  border-color: var(--color-success-700);
}
.playback-controls .btn-play:hover {
  filter: brightness(1.08);
}

.history-controls {
  display: flex;
  gap: var(--space-1);
}

.history-controls .btn-ghost {
  color: var(--color-neutral-400);
}

.history-controls .btn-ghost:hover:not(:disabled) {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.history-controls .btn-ghost:disabled {
  color: var(--color-neutral-600);
  cursor: not-allowed;
  opacity: 0.5;
}

.header-right .btn-ghost {
  color: var(--color-neutral-400);
}

.header-right .btn-ghost:hover {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.ai-load-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: #A855F7;
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.ai-load-btn:hover {
  background: #9333EA;
}

.ai-btn-loaded {
  color: #A855F7;
}

.ai-btn-loaded:hover {
  color: #C084FC;
  background: var(--color-neutral-700);
}

.connections-btn {
  color: var(--color-neutral-400);
}

.connections-btn:hover {
  color: #6366f1;
  background: var(--color-neutral-700);
}

.connections-btn.has-connections {
  color: #6366f1;
}

.github-btn {
  color: var(--color-neutral-400);
}

.github-btn:hover {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.header-version {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-300); /* on the dark header, lighter = higher contrast (neutral-500 was ~2.6:1) */
  margin-left: var(--space-1);
}

.view-switcher {
  display: flex;
  gap: var(--space-1);
  background: var(--color-neutral-900);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
}

.view-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-btn:hover {
  color: var(--color-neutral-200);
  background: var(--color-neutral-700);
}

.view-btn.active {
  color: var(--color-neutral-0);
  background: var(--color-primary-500);
}

.view-btn svg {
  width: 14px;
  height: 14px;
}

/* Responsive header: drop the version and text labels first, then the brand text and flow name;
   only on phone widths do the icon actions fold into More, then history goes. Play/Stop, the view switch and Examples always stay. */
@media (max-width: 1440px) {
  .header-version,
  .header-secondary .header-divider { display: none; }
  .header-secondary { gap: var(--space-1); }
}

@media (max-width: 1360px) {
  .view-btn span,
  .ai-load-label { display: none; }
  .header-flow-name { max-width: 140px; }
}

@media (max-width: 1140px) {
  .brand-title,
  .header-flow-name,
  .header-left .header-divider,
  .header-examples-label { display: none; }
}

@media (max-width: 900px) {
  .app-header { gap: var(--space-2); }
  .history-controls,
  .header-center .header-divider,
  .header-right .header-divider { display: none; }
}

@media (max-width: 768px) {
  .header-secondary { display: none; }
  .header-more { display: block; }
}

@media (max-width: 640px) {
  .app-header { padding: 0 var(--space-2); }
  .header-left,
  .header-right { flex: 0 1 auto; }
}

@media (max-width: 480px) {
  .header-ai,
  .header-flows { display: none; } /* both stay reachable from the More menu */
  .more-ai { display: flex; }
}

@media (max-width: 400px) {
  .app-header { gap: var(--space-1); padding: 0 var(--space-1); }
  .header-left,
  .header-center,
  .header-right { gap: 2px; }
}
</style>
