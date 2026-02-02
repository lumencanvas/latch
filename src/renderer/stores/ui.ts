import { defineStore } from 'pinia'

export type Theme = 'light' | 'dark' | 'system'
export type ViewMode = 'editor' | 'controlPanel'

// LocalStorage keys
const STORAGE_KEY_EXPOSED_CONTROLS = 'clasp-exposed-controls'
const STORAGE_KEY_CONTROL_GROUPS = 'clasp-control-groups'
const STORAGE_KEY_CONTROL_LAYOUT = 'latch-control-layout'

// Node type priorities (higher = placed first, better position)
const NODE_TYPE_PRIORITY: Record<string, number> = {
  'main-output': 100,    // Top, prominent
  'oscilloscope': 90,
  'monitor': 85,
  'knob': 50,
  'slider': 50,
  'trigger': 50,
  'constant': 50,
  'lfo': 50,
  'envelope-visual': 45,
  'parametric-eq': 45,
  'wavetable': 45,
  'xy-pad': 40,
  'keyboard': 10,        // Bottom, low priority = placed last
  'synth': 45,           // Audio controls, mid-high priority
}

// Default sizes per node type (grid units)
const NODE_TYPE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'main-output': { w: 6, h: 5 },
  'oscilloscope': { w: 5, h: 3 },
  'monitor': { w: 3, h: 2 },
  'keyboard': { w: 10, h: 2 },  // Wide, short
  'xy-pad': { w: 4, h: 4 },
  'knob': { w: 3, h: 3 },
  'slider': { w: 2, h: 4 },
  'trigger': { w: 2, h: 2 },
  'constant': { w: 3, h: 2 },
  'lfo': { w: 4, h: 3 },
  'envelope-visual': { w: 5, h: 3 },
  'parametric-eq': { w: 5, h: 4 },
  'wavetable': { w: 4, h: 3 },
  'synth': { w: 4, h: 4 },
}

/**
 * Position and size for a control in the control panel grid
 */
export interface ControlLayout {
  nodeId: string
  x: number // Grid column (0-based)
  y: number // Grid row (0-based)
  w: number // Width in grid units
  h: number // Height in grid units
  manuallyPlaced?: boolean // True if user has dragged this control
}

// Helper to load from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as T
    }
  } catch (e) {
    console.warn(`Failed to load ${key} from localStorage:`, e)
  }
  return defaultValue
}

// Helper to save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e)
  }
}

/**
 * Exposed control for the control panel
 */
export interface ExposedControl {
  id: string // Unique ID for this exposed control
  nodeId: string // ID of the node containing the control
  controlId: string // ID of the control within the node
  label: string // Display label (can be customized)
  group: string // Group name for organizing controls
  order: number // Sort order within group
  size: 'small' | 'medium' | 'large' // Control size in the panel
}

/**
 * Control panel group
 */
export interface ControlPanelGroup {
  id: string
  name: string
  order: number
  collapsed: boolean
  color?: string
}

interface UIState {
  // Left sidebar (node palette)
  sidebarOpen: boolean
  sidebarWidth: number

  // Right panel (properties)
  propertiesPanelOpen: boolean
  propertiesPanelWidth: number

  // Shader editor modal
  shaderEditorOpen: boolean
  shaderEditorNodeId: string | null

  // Code editor modal (for Function nodes)
  codeEditorOpen: boolean
  codeEditorNodeId: string | null

  // AI model manager modal
  aiModelManagerOpen: boolean

  // Node explorer modal
  nodeExplorerOpen: boolean

  // Canvas state
  zoom: number
  pan: { x: number; y: number }

  // Selection
  selectedNodes: string[]
  hoveredNode: string | null
  inspectedNode: string | null

  // Preferences
  theme: Theme
  showMinimap: boolean
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number

  // View mode
  viewMode: ViewMode

  // Control panel
  exposedControls: ExposedControl[]
  controlPanelGroups: ControlPanelGroup[]
  controlPanelEditMode: boolean
  controlPanelLayout: ControlLayout[] // Positions/sizes for control nodes
  controlPanelGridSize: number // Grid cell size in pixels
}

export const useUIStore = defineStore('ui', {
  state: (): UIState => ({
    // Left sidebar
    sidebarOpen: true,
    sidebarWidth: 240,

    // Right properties panel
    propertiesPanelOpen: true,
    propertiesPanelWidth: 320,

    // Shader editor modal
    shaderEditorOpen: false,
    shaderEditorNodeId: null,

    // Code editor modal (for Function nodes)
    codeEditorOpen: false,
    codeEditorNodeId: null as string | null,

    // AI model manager modal
    aiModelManagerOpen: false,

    // Node explorer modal
    nodeExplorerOpen: false,

    // Canvas
    zoom: 1,
    pan: { x: 0, y: 0 },

    // Selection
    selectedNodes: [],
    hoveredNode: null,
    inspectedNode: null,

    // Preferences
    theme: 'light',
    showMinimap: true,
    showGrid: true,
    snapToGrid: true,
    gridSize: 20,

    // View mode
    viewMode: 'editor',

    // Control panel - load from localStorage for persistence
    exposedControls: loadFromStorage<ExposedControl[]>(STORAGE_KEY_EXPOSED_CONTROLS, []),
    controlPanelGroups: loadFromStorage<ControlPanelGroup[]>(STORAGE_KEY_CONTROL_GROUPS, [
      { id: 'default', name: 'Controls', order: 0, collapsed: false },
    ]),
    controlPanelEditMode: false,
    controlPanelLayout: loadFromStorage<ControlLayout[]>(STORAGE_KEY_CONTROL_LAYOUT, []),
    controlPanelGridSize: 20, // 20px grid cells
  }),

  getters: {
    hasSelection: (state) => state.selectedNodes.length > 0,
    selectionCount: (state) => state.selectedNodes.length,
    effectiveTheme: (state): 'light' | 'dark' => {
      if (state.theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      return state.theme
    },
  },

  actions: {
    // Left sidebar
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },

    setSidebarWidth(width: number) {
      this.sidebarWidth = Math.max(180, Math.min(400, width))
    },

    // Right properties panel
    togglePropertiesPanel() {
      this.propertiesPanelOpen = !this.propertiesPanelOpen
    },

    openPropertiesPanel() {
      this.propertiesPanelOpen = true
    },

    closePropertiesPanel() {
      this.propertiesPanelOpen = false
    },

    setPropertiesPanelWidth(width: number) {
      this.propertiesPanelWidth = Math.max(280, Math.min(600, width))
    },

    // Shader editor modal
    openShaderEditor(nodeId: string) {
      this.shaderEditorNodeId = nodeId
      this.shaderEditorOpen = true
    },

    closeShaderEditor() {
      this.shaderEditorOpen = false
      this.shaderEditorNodeId = null
    },

    // Code editor modal
    openCodeEditor(nodeId: string) {
      this.codeEditorNodeId = nodeId
      this.codeEditorOpen = true
    },

    closeCodeEditor() {
      this.codeEditorOpen = false
      this.codeEditorNodeId = null
    },

    // AI model manager modal
    openAIModelManager() {
      this.aiModelManagerOpen = true
    },

    closeAIModelManager() {
      this.aiModelManagerOpen = false
    },

    toggleAIModelManager() {
      this.aiModelManagerOpen = !this.aiModelManagerOpen
    },

    // Node explorer modal
    openNodeExplorer() {
      this.nodeExplorerOpen = true
    },

    closeNodeExplorer() {
      this.nodeExplorerOpen = false
    },

    setZoom(zoom: number) {
      this.zoom = Math.max(0.1, Math.min(4, zoom))
    },

    zoomIn() {
      this.setZoom(this.zoom * 1.2)
    },

    zoomOut() {
      this.setZoom(this.zoom / 1.2)
    },

    resetZoom() {
      this.zoom = 1
    },

    setPan(pan: { x: number; y: number }) {
      this.pan = pan
    },

    selectNodes(nodeIds: string[]) {
      this.selectedNodes = nodeIds
    },

    addToSelection(nodeId: string) {
      if (!this.selectedNodes.includes(nodeId)) {
        this.selectedNodes.push(nodeId)
      }
    },

    removeFromSelection(nodeId: string) {
      this.selectedNodes = this.selectedNodes.filter((id) => id !== nodeId)
    },

    toggleNodeSelection(nodeId: string) {
      if (this.selectedNodes.includes(nodeId)) {
        this.removeFromSelection(nodeId)
      } else {
        this.addToSelection(nodeId)
      }
    },

    clearSelection() {
      this.selectedNodes = []
    },

    setHoveredNode(nodeId: string | null) {
      this.hoveredNode = nodeId
    },

    setInspectedNode(nodeId: string | null) {
      this.inspectedNode = nodeId
    },

    setTheme(theme: Theme) {
      this.theme = theme
      document.documentElement.setAttribute('data-theme', this.effectiveTheme)
    },

    toggleMinimap() {
      this.showMinimap = !this.showMinimap
    },

    toggleGrid() {
      this.showGrid = !this.showGrid
    },

    toggleSnapToGrid() {
      this.snapToGrid = !this.snapToGrid
    },

    setGridSize(size: number) {
      this.gridSize = Math.max(10, Math.min(100, size))
    },

    // =========================================================================
    // View Mode
    // =========================================================================

    setViewMode(mode: ViewMode) {
      this.viewMode = mode
    },

    toggleViewMode() {
      this.viewMode = this.viewMode === 'editor' ? 'controlPanel' : 'editor'
    },

    // =========================================================================
    // Control Panel
    // =========================================================================

    /**
     * Expose a control to the control panel
     */
    exposeControl(
      nodeId: string,
      controlId: string,
      label: string,
      options: { group?: string; size?: 'small' | 'medium' | 'large' } = {}
    ) {
      console.log('[UI Store] exposeControl called:', { nodeId, controlId, label })

      // Check if already exposed
      const existing = this.exposedControls.find(
        (c) => c.nodeId === nodeId && c.controlId === controlId
      )
      if (existing) {
        console.log('[UI Store] Control already exposed:', existing)
        return existing
      }

      // Ensure default group exists
      if (!this.controlPanelGroups.some(g => g.id === 'default')) {
        this.controlPanelGroups.push({ id: 'default', name: 'Controls', order: 0, collapsed: false })
        saveToStorage(STORAGE_KEY_CONTROL_GROUPS, this.controlPanelGroups)
      }

      // Get the highest order in the target group
      const group = options.group ?? 'default'
      const groupControls = this.exposedControls.filter((c) => c.group === group)
      const maxOrder = groupControls.length > 0
        ? Math.max(...groupControls.map((c) => c.order))
        : -1

      const control: ExposedControl = {
        id: `${nodeId}:${controlId}`,
        nodeId,
        controlId,
        label,
        group,
        order: maxOrder + 1,
        size: options.size ?? 'medium',
      }

      this.exposedControls.push(control)
      saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
      console.log('[UI Store] Control exposed successfully:', control)
      console.log('[UI Store] Total exposed controls:', this.exposedControls.length)
      return control
    },

    /**
     * Remove an exposed control
     */
    unexposeControl(nodeId: string, controlId: string) {
      this.exposedControls = this.exposedControls.filter(
        (c) => !(c.nodeId === nodeId && c.controlId === controlId)
      )
      saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
    },

    /**
     * Check if a control is exposed
     */
    isControlExposed(nodeId: string, controlId: string): boolean {
      return this.exposedControls.some(
        (c) => c.nodeId === nodeId && c.controlId === controlId
      )
    },

    /**
     * Update an exposed control's properties
     */
    updateExposedControl(
      id: string,
      updates: Partial<Pick<ExposedControl, 'label' | 'group' | 'order' | 'size'>>
    ) {
      const control = this.exposedControls.find((c) => c.id === id)
      if (control) {
        Object.assign(control, updates)
        saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
      }
    },

    /**
     * Reorder controls within a group
     */
    reorderControls(groupId: string, orderedIds: string[]) {
      orderedIds.forEach((id, index) => {
        const control = this.exposedControls.find((c) => c.id === id && c.group === groupId)
        if (control) {
          control.order = index
        }
      })
      saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
    },

    /**
     * Add a control panel group
     */
    addControlPanelGroup(name: string, color?: string): ControlPanelGroup {
      const maxOrder = this.controlPanelGroups.length > 0
        ? Math.max(...this.controlPanelGroups.map((g) => g.order))
        : -1

      const group: ControlPanelGroup = {
        id: `group-${Date.now()}`,
        name,
        order: maxOrder + 1,
        collapsed: false,
        color,
      }

      this.controlPanelGroups.push(group)
      saveToStorage(STORAGE_KEY_CONTROL_GROUPS, this.controlPanelGroups)
      return group
    },

    /**
     * Remove a control panel group (moves controls to default)
     */
    removeControlPanelGroup(groupId: string) {
      if (groupId === 'default') return // Can't remove default group

      // Move controls from this group to default
      this.exposedControls.forEach((c) => {
        if (c.group === groupId) {
          c.group = 'default'
        }
      })

      this.controlPanelGroups = this.controlPanelGroups.filter((g) => g.id !== groupId)
      saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
      saveToStorage(STORAGE_KEY_CONTROL_GROUPS, this.controlPanelGroups)
    },

    /**
     * Update a control panel group
     */
    updateControlPanelGroup(
      groupId: string,
      updates: Partial<Pick<ControlPanelGroup, 'name' | 'order' | 'collapsed' | 'color'>>
    ) {
      const group = this.controlPanelGroups.find((g) => g.id === groupId)
      if (group) {
        Object.assign(group, updates)
        saveToStorage(STORAGE_KEY_CONTROL_GROUPS, this.controlPanelGroups)
      }
    },

    /**
     * Toggle control panel edit mode
     */
    toggleControlPanelEditMode() {
      this.controlPanelEditMode = !this.controlPanelEditMode
    },

    /**
     * Get exposed controls grouped by group ID
     */
    getControlsByGroup(): Map<string, ExposedControl[]> {
      const map = new Map<string, ExposedControl[]>()

      // Initialize with all groups
      for (const group of this.controlPanelGroups) {
        map.set(group.id, [])
      }

      // Add controls to their groups
      for (const control of this.exposedControls) {
        const groupControls = map.get(control.group) ?? []
        groupControls.push(control)
        map.set(control.group, groupControls)
      }

      // Sort controls within each group by order
      for (const [, controls] of map) {
        controls.sort((a, b) => a.order - b.order)
      }

      return map
    },

    /**
     * Clean up exposed controls for deleted nodes
     */
    cleanupExposedControls(existingNodeIds: string[]) {
      const nodeIdSet = new Set(existingNodeIds)
      this.exposedControls = this.exposedControls.filter((c) => nodeIdSet.has(c.nodeId))
      saveToStorage(STORAGE_KEY_EXPOSED_CONTROLS, this.exposedControls)
    },

    // =========================================================================
    // Control Panel Layout (drag-drop grid)
    // =========================================================================

    /**
     * Check if a position collides with any existing layout
     */
    checkCollision(x: number, y: number, w: number, h: number, excludeNodeId?: string): boolean {
      for (const layout of this.controlPanelLayout) {
        if (layout.nodeId === excludeNodeId) continue
        // Check rectangle overlap
        if (
          x < layout.x + layout.w &&
          x + w > layout.x &&
          y < layout.y + layout.h &&
          y + h > layout.y
        ) {
          return true
        }
      }
      return false
    },

    /**
     * Find first valid position for a control using bin packing
     */
    findFirstValidPosition(w: number, h: number, gridCols: number = 12): { x: number; y: number } {
      // Scan grid left-to-right, top-to-bottom
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x <= gridCols - w; x++) {
          if (!this.checkCollision(x, y, w, h)) {
            return { x, y }
          }
        }
      }
      // Fallback: place at end
      const maxY = this.controlPanelLayout.length > 0
        ? Math.max(...this.controlPanelLayout.map(l => l.y + l.h))
        : 0
      return { x: 0, y: maxY }
    },

    /**
     * Get default size for a node type
     */
    getDefaultSize(nodeType: string): { w: number; h: number } {
      return NODE_TYPE_DEFAULT_SIZE[nodeType] ?? { w: 4, h: 3 }
    },

    /**
     * Get priority for a node type (higher = placed first)
     */
    getNodeTypePriority(nodeType: string): number {
      return NODE_TYPE_PRIORITY[nodeType] ?? 50
    },

    /**
     * Get layout for a node, or create default if not exists
     * Uses smart bin-packing to find first available position
     */
    getControlLayout(nodeId: string, nodeType?: string): ControlLayout {
      let layout = this.controlPanelLayout.find(l => l.nodeId === nodeId)
      if (!layout) {
        // Auto-place new controls using bin packing with type-specific size
        const size = this.getDefaultSize(nodeType ?? 'unknown')

        // Keyboard: prefer bottom placement
        if (nodeType === 'keyboard') {
          const maxY = this.controlPanelLayout.length > 0
            ? Math.max(...this.controlPanelLayout.map(l => l.y + l.h))
            : 0
          layout = { nodeId, x: 0, y: maxY, w: size.w, h: size.h, manuallyPlaced: false }
        } else {
          const { x, y } = this.findFirstValidPosition(size.w, size.h)
          layout = { nodeId, x, y, w: size.w, h: size.h, manuallyPlaced: false }
        }

        this.controlPanelLayout.push(layout)
        saveToStorage(STORAGE_KEY_CONTROL_LAYOUT, this.controlPanelLayout)
      }
      return layout
    },

    /**
     * Auto-layout all controls based on priority
     */
    autoLayoutAll(nodes: Array<{ id: string; nodeType: string }>, gridCols: number = 12) {
      // Clear all layouts
      this.controlPanelLayout = []

      // Sort by priority (high first)
      const sorted = [...nodes].sort((a, b) =>
        this.getNodeTypePriority(b.nodeType) - this.getNodeTypePriority(a.nodeType)
      )

      // Place each node
      for (const node of sorted) {
        const size = this.getDefaultSize(node.nodeType)

        // Keyboard special case: place at bottom, full width
        if (node.nodeType === 'keyboard') {
          const maxY = this.controlPanelLayout.length > 0
            ? Math.max(...this.controlPanelLayout.map(l => l.y + l.h))
            : 0
          this.controlPanelLayout.push({
            nodeId: node.id,
            x: 0,
            y: maxY,
            w: Math.min(gridCols, size.w),
            h: size.h,
            manuallyPlaced: false,
          })
        } else {
          const { x, y } = this.findFirstValidPosition(size.w, size.h, gridCols)
          this.controlPanelLayout.push({
            nodeId: node.id,
            x,
            y,
            w: size.w,
            h: size.h,
            manuallyPlaced: false,
          })
        }
      }

      saveToStorage(STORAGE_KEY_CONTROL_LAYOUT, this.controlPanelLayout)
    },

    /**
     * Update layout for a control node
     * Automatically marks as manually placed when position is updated
     */
    updateControlLayout(nodeId: string, updates: Partial<Omit<ControlLayout, 'nodeId'>>, markManual: boolean = true) {
      const layout = this.controlPanelLayout.find(l => l.nodeId === nodeId)
      if (layout) {
        Object.assign(layout, updates)
        // Mark as manually placed when user drags
        if (markManual && (updates.x !== undefined || updates.y !== undefined)) {
          layout.manuallyPlaced = true
        }
      } else {
        this.controlPanelLayout.push({
          nodeId,
          x: updates.x ?? 0,
          y: updates.y ?? 0,
          w: updates.w ?? 4,
          h: updates.h ?? 3,
          manuallyPlaced: markManual && (updates.x !== undefined || updates.y !== undefined),
        })
      }
      saveToStorage(STORAGE_KEY_CONTROL_LAYOUT, this.controlPanelLayout)
    },

    /**
     * Remove layout for a node
     */
    removeControlLayout(nodeId: string) {
      this.controlPanelLayout = this.controlPanelLayout.filter(l => l.nodeId !== nodeId)
      saveToStorage(STORAGE_KEY_CONTROL_LAYOUT, this.controlPanelLayout)
    },

    /**
     * Snap value to grid
     */
    snapToControlGrid(value: number): number {
      return Math.round(value / this.controlPanelGridSize) * this.controlPanelGridSize
    },
  },
})
