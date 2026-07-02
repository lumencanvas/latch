import { defineStore } from 'pinia'
import type { Component } from 'vue'
import { fuzzySearch } from '@/utils/fuzzySearch'
import type { NodeConnectionRequirement } from '@/services/connections/types'
import type { NodeRequirement } from '@/utils/platform'
import type { TrustTier } from '@/services/security/trust'

export type NodeCategory =
  | 'debug'
  | 'inputs'
  | 'outputs'
  | 'timing'
  | 'math'
  | 'logic'
  | 'audio'
  | 'video'
  | 'visual'
  | 'shaders'
  | 'data'
  | 'ai'
  | 'code'
  | '3d'
  | 'connectivity'
  | 'clasp'
  | 'subflows'
  | 'string'
  | 'messaging'
  | 'custom'

export type DataType =
  | 'trigger'
  | 'number'
  | 'string'
  | 'boolean'
  | 'audio'
  | 'video'
  | 'texture'
  | 'data'
  | 'array'
  | 'any'
  // 3D types
  | 'scene3d'
  | 'object3d'
  | 'geometry3d'
  | 'material3d'
  | 'camera3d'
  | 'light3d'
  | 'transform3d'

export type Platform = 'web' | 'electron'

export interface PortDefinition {
  id: string
  type: DataType
  label: string
  description?: string
  required?: boolean
  multiple?: boolean
  default?: unknown
}

/**
 * A single condition in a {@link WhenSchema}. A bare value tests strict equality against the
 * sibling control's current value; the operator objects add membership / inequality / ordering
 * (Phase 3 bullet 2). Runtime-discriminated by `evaluateWhen` — the union collapses to `unknown`
 * for TS, which is intentional (values are author-supplied and validated at the edges).
 */
export type WhenCondition =
  | { in: unknown[] }
  | { ne: unknown }
  | { gt: number }
  | { lt: number }
  | unknown

/**
 * Unified conditional-visibility schema (Phase 3). Keys are sibling control ids; the control
 * shows only when EVERY entry matches (AND). Subsumes the three legacy schemas — `visibleWhen`
 * (single-key equality), the panel's `props.showWhen` (multi-key equality), and the connection
 * form's `showIf` (equality or array membership → `{ in }`). Evaluate with `evaluateWhen`.
 */
export type WhenSchema = Record<string, WhenCondition>

/**
 * Declarative custom-UI schema (Phase 3 bullet 2) — rendered by one `<NodeView>` interpreter on
 * both surfaces. See `docs/plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md`. The widget `type`
 * is a CLOSED enum (never a component path or code); primitives delegate to `<ControlRenderer>`,
 * rich widgets dispatch through a registry private to the interpreter.
 */
export type Surface = 'node' | 'panel'

export type WidgetType =
  // primitives (delegated to <ControlRenderer>)
  | 'slider' | 'number' | 'toggle' | 'select' | 'text' | 'color'
  // tier A — simple 2-way / readout
  | 'knob' | 'asset' | 'connection' | 'readout'
  // tier B — aggregate (one structured value ↔ many flat fields)
  | 'xy' | 'eq' | 'env' | 'wave'
  // tier C — event / dual-state (usually reached via `component?` instead)
  | 'piano' | 'gamepad'
  // deferred / future slots
  | 'curve' | 'gradient' | 'image' | 'button'

export interface UIWidget {
  type: WidgetType
  /** A control id (2-way) or, with `source: 'output'`, an output-port id (read-only). */
  bind: string
  source?: 'control' | 'output'
  label?: string
  when?: WhenSchema
  /** Whitelisted per widget type; primitive/string|number-array values only — no functions/objects. */
  props?: Record<string, string | number | boolean | Array<string | number>>
}

export interface UIRow {
  label?: string
  when?: WhenSchema
  widgets: UIWidget[]
}

export interface UISchema {
  rows: UIRow[]
  /** Which surfaces render this schema; defaults to both. */
  surfaces?: Surface[]
}

export interface ControlDefinition {
  id: string
  type: string
  label: string
  description?: string
  default?: unknown
  exposable?: boolean
  bindable?: boolean
  /** Unified conditional-visibility (preferred). Show only when these sibling values match. */
  when?: WhenSchema
  /** @deprecated Legacy single-key form; use {@link when}. Still honored on-canvas. */
  visibleWhen?: { controlId: string; value: unknown }
  props?: Record<string, unknown>
}

export interface NodeInfo {
  /** 2-4 sentence explanation of what this node does and when to use it. */
  overview: string
  /** Short, actionable tips. One sentence each. */
  tips?: string[]
  /** Node IDs of nodes that complement this one. */
  pairsWith?: string[]
}

export interface NodeDefinition {
  id: string
  name: string
  version: string
  category: NodeCategory
  description: string
  icon: string
  color?: string
  platforms: Platform[]
  webFallback?: string
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  controls: ControlDefinition[]
  /**
   * Declarative custom UI (Phase 3 bullet 2) — rendered by `<NodeView>` on both surfaces, preferred
   * over `component`. Absent `ui` + absent `component` → BaseNode's auto-layout (today's default).
   * See the DECLARATIVE_UI_NODEVIEW design doc.
   */
  ui?: UISchema
  /**
   * RESERVED (Phase 3 bullet 2) — the intended bespoke-SFC escape hatch for nodes that capture raw
   * input (keyboard/MIDI/gamepad), render a live surface (video/canvas/code editor/emulator), or need
   * bespoke geometry. NOT yet consumed: today those nodes still route through `registry/components.ts`
   * by nodeType. Wiring this field (so `components.ts` derives from it) is a later increment; declared
   * now only to fix the schema shape. Live render order is `ui` → BaseNode auto-layout.
   */
  component?: Component
  tags?: string[]
  /** Connection requirements for this node (protocols it needs) */
  connections?: NodeConnectionRequirement[]
  /**
   * Abstract hardware/runtime capabilities this node needs (e.g. 'serial',
   * 'webgpu'). Resolved per-platform via `resolveNodeRequirement` so the node
   * can show an "unavailable here" badge, honoring the native-or-web duality.
   */
  requires?: NodeRequirement[]
  /**
   * Trust tier (SECURITY_MODEL step 3). Assigned by HOW the node reached the runtime,
   * never self-declared — built-ins leave it unset (→ `core` via `nodeTrust`); the
   * custom-node loader stamps `local` (file drop) or `community` (imported share). The
   * capability gate keys off this: only `community` nodes are capability-gated.
   */
  trust?: TrustTier
  /** Additional info displayed in the Info tab of the properties panel. */
  info?: NodeInfo
}

interface NodesStoreState {
  definitions: Map<string, NodeDefinition>
  components: Map<string, Component>
  searchQuery: string
  categoryFilter: NodeCategory | null
}

export const useNodesStore = defineStore('nodes', {
  state: (): NodesStoreState => ({
    definitions: new Map(),
    components: new Map(),
    searchQuery: '',
    categoryFilter: null,
  }),

  getters: {
    allDefinitions: (state): NodeDefinition[] => {
      return Array.from(state.definitions.values())
    },

    filteredDefinitions(): NodeDefinition[] {
      let results = this.allDefinitions

      // Filter by category
      if (this.categoryFilter) {
        results = results.filter((d) => d.category === this.categoryFilter)
      }

      // Filter by search with fuzzy matching
      if (this.searchQuery.trim()) {
        const searchResults = fuzzySearch(
          results,
          this.searchQuery,
          (d) => [d.name, d.description, ...(d.tags ?? [])]
        )
        results = searchResults.map(r => r.item)
      }

      return results
    },

    byCategory(): Map<NodeCategory, NodeDefinition[]> {
      const map = new Map<NodeCategory, NodeDefinition[]>()
      for (const def of this.allDefinitions) {
        const list = map.get(def.category) ?? []
        list.push(def)
        map.set(def.category, list)
      }
      return map
    },

    categories(): NodeCategory[] {
      return Array.from(this.byCategory.keys()).sort()
    },

    getDefinition: (state) => (id: string): NodeDefinition | undefined => {
      return state.definitions.get(id)
    },

    getComponent: (state) => (id: string): Component | undefined => {
      return state.components.get(id)
    },

    isAvailable: (state) => (id: string, platform: Platform): boolean => {
      const def = state.definitions.get(id)
      if (!def) return false
      return def.platforms.includes(platform)
    },
  },

  actions: {
    register(definition: NodeDefinition, component?: Component) {
      if (import.meta.env.DEV && this.definitions.has(definition.id)) {
        console.warn(
          `[nodes] Duplicate node id "${definition.id}" — the later registration ` +
          `overwrites the earlier one. Node ids must be unique across all categories.`
        )
      }
      this.definitions.set(definition.id, definition)
      if (component) {
        this.components.set(definition.id, component)
      }
    },

    unregister(id: string) {
      this.definitions.delete(id)
      this.components.delete(id)
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    setCategoryFilter(category: NodeCategory | null) {
      this.categoryFilter = category
    },

    clearFilters() {
      this.searchQuery = ''
      this.categoryFilter = null
    },
  },
})

// Category metadata for UI
export const categoryMeta: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  debug: { label: 'Debug', icon: 'bug', color: '#64748B' },
  inputs: { label: 'Inputs', icon: 'download', color: '#22C55E' },
  outputs: { label: 'Outputs', icon: 'upload', color: '#3B82F6' },
  timing: { label: 'Timing', icon: 'clock', color: '#F97316' },
  math: { label: 'Math', icon: 'calculator', color: '#F59E0B' },
  logic: { label: 'Logic', icon: 'git-branch', color: '#EF4444' },
  audio: { label: 'Audio', icon: 'music', color: '#22C55E' },
  video: { label: 'Video', icon: 'video', color: '#3B82F6' },
  visual: { label: 'Visual', icon: 'image', color: '#EC4899' },
  shaders: { label: 'Shaders', icon: 'code', color: '#EC4899' },
  data: { label: 'Data', icon: 'database', color: '#6B7280' },
  ai: { label: 'AI (Local)', icon: 'brain', color: '#A855F7' },
  code: { label: 'Code', icon: 'terminal', color: '#F59E0B' },
  '3d': { label: '3D', icon: 'box', color: '#0EA5E9' },
  connectivity: { label: 'Connectivity', icon: 'plug', color: '#2AAB8A' },
  clasp: { label: 'CLASP', icon: 'radio', color: '#6366F1' },
  subflows: { label: 'Subflows', icon: 'layers', color: '#84CC16' },
  string: { label: 'String', icon: 'text', color: '#10B981' },
  messaging: { label: 'Messaging', icon: 'send', color: '#06B6D4' },
  custom: { label: 'Custom', icon: 'puzzle', color: '#6B7280' },
}

// Data type metadata
export const dataTypeMeta: Record<DataType, { label: string; color: string; lineStyle: string }> = {
  trigger: { label: 'Trigger', color: '#F59E0B', lineStyle: 'solid' },
  number: { label: 'Number', color: '#2AAB8A', lineStyle: 'solid' },
  string: { label: 'String', color: '#8B5CF6', lineStyle: 'solid' },
  boolean: { label: 'Boolean', color: '#EF4444', lineStyle: 'dotted' },
  audio: { label: 'Audio', color: '#22C55E', lineStyle: 'solid' },
  video: { label: 'Video', color: '#3B82F6', lineStyle: 'solid' },
  texture: { label: 'Texture', color: '#EC4899', lineStyle: 'dashed' },
  data: { label: 'Data', color: '#6B7280', lineStyle: 'solid' },
  array: { label: 'Array', color: '#0EA5E9', lineStyle: 'solid' },
  any: { label: 'Any', color: '#D4D4D4', lineStyle: 'dotted' },
  // 3D types
  scene3d: { label: 'Scene 3D', color: '#0EA5E9', lineStyle: 'solid' },
  object3d: { label: 'Object 3D', color: '#38BDF8', lineStyle: 'solid' },
  geometry3d: { label: 'Geometry 3D', color: '#7DD3FC', lineStyle: 'solid' },
  material3d: { label: 'Material 3D', color: '#BAE6FD', lineStyle: 'solid' },
  camera3d: { label: 'Camera 3D', color: '#0284C7', lineStyle: 'solid' },
  light3d: { label: 'Light 3D', color: '#FCD34D', lineStyle: 'solid' },
  transform3d: { label: 'Transform 3D', color: '#A5F3FC', lineStyle: 'solid' },
}
