<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PanelLeft, PanelRight } from 'lucide-vue-next'
import { useUIStore } from './stores/ui'
import { useFlowsStore } from './stores/flows'
import AppHeader from './components/layout/AppHeader.vue'
import FlowTabs from './components/layout/FlowTabs.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import PropertiesPanel from './components/layout/PropertiesPanel.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ShaderEditorModal from './components/modals/ShaderEditorModal.vue'
import CodeEditorModal from './components/modals/CodeEditorModal.vue'
import AIModelManagerModal from './components/modals/AIModelManagerModal.vue'
import ConnectionManagerModal from './components/connections/ConnectionManagerModal.vue'
import NodeExplorerModal from './components/modals/NodeExplorerModal.vue'
import LoadingScreen from './components/branding/LoadingScreen.vue'
import { usePersistence } from './composables/usePersistence'
import { useExecutionEngine } from './composables/useExecutionEngine'
import { aiInference } from './services/ai/AIInference'

const route = useRoute()
const router = useRouter()
const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const { initialize, isLoading, saveActiveFlow } = usePersistence()

// Guard against losing unsaved edits on reload/close/crash. Autosave is debounced
// 2s, so recent edits may not have reached IndexedDB yet. Fire a best-effort flush
// (async — may not finish) and prompt the user; the prompt is the real protection.
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (flowsStore.hasUnsavedChanges) {
    void saveActiveFlow()
    e.preventDefault()
    e.returnValue = ''
  }
}

// Initialize execution engine at app level so controls are available to all components
const executionEngine = useExecutionEngine()

// Provide execution controls to all child components
provide('executionControls', {
  start: executionEngine.start,
  stop: executionEngine.stop,
  pause: executionEngine.pause,
  resume: executionEngine.resume,
  toggle: executionEngine.toggle,
})

const isInitialized = ref(false)
const isRouterReady = ref(false)

// Check if we're in the editor view
// Default to true when route is not yet resolved (since '/' is the editor route)
const isEditorView = computed(() => {
  if (!isRouterReady.value) return true // Default to editor view before router resolves
  return route.name === 'editor' || route.name === undefined || route.name === null
})

const appClasses = computed(() => ({
  'app': true,
  'sidebar-collapsed': !uiStore.sidebarOpen,
  'control-panel-mode': route.name === 'controls',
  'is-mobile': uiStore.isMobile,
}))

// Mobile breakpoint: below this, panels become overlay drawers and default closed.
let breakpointMql: MediaQueryList | null = null
function onBreakpointChange() {
  uiStore.setIsMobile(breakpointMql ? breakpointMql.matches : false)
}

function closePanels() {
  uiStore.sidebarOpen = false
  uiStore.propertiesPanelOpen = false
}

onMounted(async () => {
  // Set up the responsive breakpoint immediately (before the async router wait).
  if (typeof window !== 'undefined' && window.matchMedia) {
    breakpointMql = window.matchMedia('(max-width: 768px)')
    onBreakpointChange()
    breakpointMql.addEventListener('change', onBreakpointChange)
  }

  window.addEventListener('beforeunload', handleBeforeUnload)

  // Wait for router to be ready before rendering route-dependent content
  await router.isReady()
  isRouterReady.value = true

  try {
    await initialize()
  } catch (error) {
    console.error('Failed to initialize persistence:', error)
  } finally {
    isInitialized.value = true
  }

  // Load AI settings and auto-load any configured models
  // This runs in the background and doesn't block app initialization
  aiInference.loadSettingsFromStorage().then(() => {
    aiInference.autoLoadModels(() => {
      // progress callback (silent)
    }).catch(error => {
      console.error('[AI Auto-load] Failed:', error)
    })
  })
})

onUnmounted(() => {
  breakpointMql?.removeEventListener('change', onBreakpointChange)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div :class="appClasses">
    <!-- Animated loading screen on app launch -->
    <LoadingScreen />

    <!-- Old loading overlay for data loading -->
    <div
      v-if="!isInitialized || isLoading"
      class="loading-overlay"
    >
      <div class="loading-spinner" />
      <span>Loading data...</span>
    </div>

    <template v-else>
      <AppHeader />
      <FlowTabs v-if="isEditorView" />
      <div class="app-body">
        <AppSidebar v-if="isEditorView" />

        <!-- Reopen rail (left) — restores a collapsed sidebar from the edge -->
        <button
          v-if="isEditorView && !uiStore.sidebarOpen"
          class="panel-rail panel-rail-left"
          title="Open node palette"
          aria-label="Open node palette"
          @click="uiStore.toggleSidebar()"
        >
          <PanelLeft :size="16" />
        </button>

        <main class="app-main">
          <!-- Keep the editor (and any running Emulator node) alive when switching
               to Controls/Settings, so it isn't torn down and re-created. -->
          <router-view v-slot="{ Component }">
            <KeepAlive :include="['EditorView']">
              <component :is="Component" />
            </KeepAlive>
          </router-view>
        </main>

        <!-- Reopen rail (right) — restores a collapsed properties panel -->
        <button
          v-if="isEditorView && !uiStore.propertiesPanelOpen"
          class="panel-rail panel-rail-right"
          title="Open properties"
          aria-label="Open properties"
          @click="uiStore.openPropertiesPanel()"
        >
          <PanelRight :size="16" />
        </button>

        <PropertiesPanel v-if="isEditorView" />

        <!-- Mobile: tapping the backdrop dismisses an open overlay panel -->
        <div
          v-if="isEditorView && uiStore.isMobile && (uiStore.sidebarOpen || uiStore.propertiesPanelOpen)"
          class="panel-backdrop"
          @click="closePanels"
        />
      </div>
      <StatusBar v-if="isEditorView" />

      <!-- Modals -->
      <ShaderEditorModal v-if="isEditorView" />
      <CodeEditorModal v-if="isEditorView" />
      <AIModelManagerModal />
      <ConnectionManagerModal />
      <NodeExplorerModal />
    </template>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-neutral-100);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.app-main {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Edge rails: a persistent, touch-sized way to reopen a collapsed panel. */
.panel-rail {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 64px;
  padding: 0;
  color: var(--color-neutral-600);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  cursor: pointer;
  box-shadow: 2px 2px 0 0 var(--color-neutral-300);
}

.panel-rail:hover {
  color: var(--color-primary-500);
  border-color: var(--color-primary-400);
}

.panel-rail-left {
  left: 0;
  border-left: 0;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.panel-rail-right {
  right: 0;
  border-right: 0;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

/* Mobile: panels overlay the canvas; a backdrop sits between them. */
.panel-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.35);
}

/* Bigger touch targets for the reopen rails on coarse pointers. */
@media (pointer: coarse) {
  .panel-rail {
    width: 36px;
    height: 88px;
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  background: var(--color-neutral-100);
  z-index: 1000;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-neutral-200);
  border-top-color: var(--color-primary-400);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
