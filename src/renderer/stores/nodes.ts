import { defineStore } from 'pinia'
import type { Component } from 'vue'
import { fuzzySearch } from '@/utils/fuzzySearch'
import type { NodeConnectionRequirement } from '@/services/connections/types'

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

export interface ControlDefinition {
  id: string
  type: string
  label: string
  description?: string
  default?: unknown
  exposable?: boolean
  bindable?: boolean
  /** Show this control only when another control has a specific value. */
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
  tags?: string[]
  /** Connection requirements for this node (protocols it needs) */
  connections?: NodeConnectionRequirement[]
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
  debug: { label: 'Debug', icon: 'bug', color: '#8B5CF6' },
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
  subflows: { label: 'Subflows', icon: 'layers', color: '#7C3AED' },
  string: { label: 'String', icon: 'text', color: '#10B981' },
  messaging: { label: 'Messaging', icon: 'send', color: '#8B5CF6' },
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
