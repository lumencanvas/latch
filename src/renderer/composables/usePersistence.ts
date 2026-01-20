import { ref, watch } from 'vue'
import { useFlowsStore, type FlowState } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { flowStorage, settingsStorage, initializeDatabase, type PersistedFlow } from '@/services/database'

// Debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), ms)
  }) as T
}

/**
 * Composable for managing persistence
 */
export function usePersistence() {
  const flowsStore = useFlowsStore()
  const uiStore = useUIStore()

  const isLoading = ref(false)
  const isSaving = ref(false)
  const lastSaveTime = ref<Date | null>(null)
  const saveError = ref<string | null>(null)

  /**
   * Convert FlowState to PersistedFlow (includes all properties)
   */
  function toPersistedFlow(flow: FlowState): PersistedFlow {
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      nodes: JSON.parse(JSON.stringify(flow.nodes)),
      edges: JSON.parse(JSON.stringify(flow.edges)),
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
      // Subflow properties
      isSubflow: flow.isSubflow,
      subflowInputs: JSON.parse(JSON.stringify(flow.subflowInputs)),
      subflowOutputs: JSON.parse(JSON.stringify(flow.subflowOutputs)),
      icon: flow.icon,
      category: flow.category,
    } as PersistedFlow
  }

  /**
   * Convert PersistedFlow to FlowState with migration
   */
  function toFlowState(persisted: PersistedFlow): FlowState {
    // Special node types that have their own Vue components
    const specialNodeTypes = [
      'main-output', 'trigger', 'xy-pad', 'monitor', 'oscilloscope', 'graph', 'equalizer',
      'textbox', 'knob', 'keyboard', 'envelope-visual', 'parametric-eq', 'wavetable', 'step-sequencer',
      'mediapipe-hand', 'mediapipe-face', 'mediapipe-pose', 'mediapipe-object',
      'mediapipe-segmentation', 'mediapipe-gesture', 'mediapipe-audio',
      'function', 'synth',
    ]

    // Migrate nodes - ensure special nodes have correct Vue Flow type
    const migratedNodes = persisted.nodes.map(node => {
      const nodeType = node.data?.nodeType as string | undefined

      // If nodeType is a special type, ensure Vue Flow type matches
      if (nodeType && specialNodeTypes.includes(nodeType)) {
        return {
          ...node,
          type: nodeType, // Use the special component
          data: {
            ...node.data,
            nodeType,
          },
        }
      }

      // For non-special nodes, use 'custom' (BaseNode)
      if (node.type !== 'custom' && node.type !== 'default' && !specialNodeTypes.includes(node.type as string)) {
        return {
          ...node,
          type: 'custom',
          data: {
            ...node.data,
            nodeType: nodeType ?? node.type,
          },
        }
      }

      return node
    })

    return {
      id: persisted.id,
      name: persisted.name,
      description: persisted.description,
      nodes: migratedNodes,
      edges: persisted.edges,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      dirty: false,
      // Subflow properties (with migration for old flows)
      isSubflow: (persisted as FlowState).isSubflow ?? false,
      subflowInputs: (persisted as FlowState).subflowInputs ?? [],
      subflowOutputs: (persisted as FlowState).subflowOutputs ?? [],
      icon: (persisted as FlowState).icon,
      category: (persisted as FlowState).category,
    }
  }

  /**
   * Load all flows from database
   */
  async function loadFlows(): Promise<void> {
    isLoading.value = true
    try {
      const persistedFlows = await flowStorage.getAll()

      // Clear existing flows
      flowsStore.$patch({ flows: [], activeFlowId: null })

      // Add persisted flows
      for (const persisted of persistedFlows) {
        flowsStore.flows.push(toFlowState(persisted))
      }

      // Load settings to get last opened flow
      const settings = await settingsStorage.get()
      if (settings?.lastOpenedFlowId && flowsStore.flows.some(f => f.id === settings.lastOpenedFlowId)) {
        flowsStore.setActiveFlow(settings.lastOpenedFlowId)
      } else if (flowsStore.flows.length > 0) {
        flowsStore.setActiveFlow(flowsStore.flows[0].id)
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Save a specific flow to database
   */
  async function saveFlow(flowId: string): Promise<void> {
    const flow = flowsStore.getFlowById(flowId)
    if (!flow) return

    isSaving.value = true
    saveError.value = null

    try {
      await flowStorage.save(toPersistedFlow(flow))
      flowsStore.markSaved()
      lastSaveTime.value = new Date()
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : 'Failed to save flow'
      console.error('Failed to save flow:', error)
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Save the active flow
   */
  async function saveActiveFlow(): Promise<void> {
    if (flowsStore.activeFlowId) {
      await saveFlow(flowsStore.activeFlowId)
    }
  }

  /**
   * Delete a flow from database
   */
  async function deleteFlow(flowId: string): Promise<void> {
    await flowStorage.delete(flowId)
  }

  /**
   * Save UI settings
   */
  async function saveSettings(): Promise<void> {
    await settingsStorage.save({
      theme: uiStore.theme,
      showMinimap: uiStore.showMinimap,
      showGrid: uiStore.showGrid,
      snapToGrid: uiStore.snapToGrid,
      gridSize: uiStore.gridSize,
      sidebarWidth: uiStore.sidebarWidth,
      lastOpenedFlowId: flowsStore.activeFlowId,
    })
  }

  /**
   * Load UI settings
   */
  async function loadSettings(): Promise<void> {
    const settings = await settingsStorage.get()
    if (settings) {
      uiStore.setTheme(settings.theme)
      uiStore.showMinimap = settings.showMinimap
      uiStore.showGrid = settings.showGrid
      uiStore.snapToGrid = settings.snapToGrid
      uiStore.setGridSize(settings.gridSize)
      uiStore.setSidebarWidth(settings.sidebarWidth)
    }
  }

  // Debounced auto-save
  const debouncedSave = debounce(async () => {
    if (flowsStore.activeFlow?.dirty) {
      await saveActiveFlow()
    }
  }, 2000)

  /**
   * Start auto-save watching
   */
  function startAutoSave(): void {
    // Watch for flow changes and auto-save
    watch(
      () => flowsStore.activeFlow?.dirty,
      (isDirty) => {
        if (isDirty) {
          debouncedSave()
        }
      }
    )

    // Save settings when they change
    watch(
      () => [
        uiStore.theme,
        uiStore.showMinimap,
        uiStore.showGrid,
        uiStore.snapToGrid,
        uiStore.gridSize,
        uiStore.sidebarWidth,
      ],
      () => {
        saveSettings()
      },
      { deep: true }
    )

    // Save last opened flow when it changes
    watch(
      () => flowsStore.activeFlowId,
      () => {
        saveSettings()
      }
    )
  }

  /**
   * Initialize persistence
   */
  async function initialize(): Promise<void> {
    await initializeDatabase()
    await loadSettings()
    await loadFlows()
    startAutoSave()
  }

  return {
    isLoading,
    isSaving,
    lastSaveTime,
    saveError,
    loadFlows,
    saveFlow,
    saveActiveFlow,
    deleteFlow,
    saveSettings,
    loadSettings,
    initialize,
  }
}
