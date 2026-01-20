<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUIStore } from './stores/ui'
import AppHeader from './components/layout/AppHeader.vue'
import FlowTabs from './components/layout/FlowTabs.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import PropertiesPanel from './components/layout/PropertiesPanel.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ShaderEditorModal from './components/modals/ShaderEditorModal.vue'
import AIModelManagerModal from './components/modals/AIModelManagerModal.vue'
import ConnectionManagerModal from './components/connections/ConnectionManagerModal.vue'
import LoadingScreen from './components/branding/LoadingScreen.vue'
import { usePersistence } from './composables/usePersistence'
import { useExecutionEngine } from './composables/useExecutionEngine'
import { aiInference } from './services/ai/AIInference'

const route = useRoute()
const router = useRouter()
const uiStore = useUIStore()
const { initialize, isLoading } = usePersistence()

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
}))

onMounted(async () => {
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
    let lastLoggedProgress = -1
    aiInference.autoLoadModels((task, progress) => {
      // Only log when progress changes by at least 10%
      const rounded = Math.round(progress / 10) * 10
      if (rounded !== lastLoggedProgress) {
        lastLoggedProgress = rounded
        console.log(`[AI Auto-load] ${task}: ${rounded}%`)
      }
    }).catch(error => {
      console.error('[AI Auto-load] Failed:', error)
    })
  })
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
        <main class="app-main">
          <router-view />
        </main>
        <PropertiesPanel v-if="isEditorView" />
      </div>
      <StatusBar v-if="isEditorView" />

      <!-- Modals -->
      <ShaderEditorModal v-if="isEditorView" />
      <AIModelManagerModal />
      <ConnectionManagerModal />
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
}

.app-main {
  flex: 1;
  overflow: hidden;
  position: relative;
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
