import { defineStore } from 'pinia'
import type { Node, Edge } from '@vue-flow/core'

export interface FlowSnapshot {
  nodes: Node[]
  edges: Edge[]
  timestamp: number
}

export interface HistoryEntry {
  flowId: string
  before: FlowSnapshot
  after: FlowSnapshot
  description: string
}

interface HistoryState {
  // Per-flow history stacks
  undoStacks: Map<string, HistoryEntry[]>
  redoStacks: Map<string, HistoryEntry[]>
  maxHistorySize: number
  // Track if we're currently undoing/redoing to prevent recording those changes
  isUndoingOrRedoing: boolean
}

export const useHistoryStore = defineStore('history', {
  state: (): HistoryState => ({
    undoStacks: new Map(),
    redoStacks: new Map(),
    maxHistorySize: 20,
    isUndoingOrRedoing: false,
  }),

  getters: {
    canUndo: (state) => (flowId: string): boolean => {
      const stack = state.undoStacks.get(flowId)
      return stack ? stack.length > 0 : false
    },

    canRedo: (state) => (flowId: string): boolean => {
      const stack = state.redoStacks.get(flowId)
      return stack ? stack.length > 0 : false
    },

    undoStackSize: (state) => (flowId: string): number => {
      return state.undoStacks.get(flowId)?.length ?? 0
    },

    redoStackSize: (state) => (flowId: string): number => {
      return state.redoStacks.get(flowId)?.length ?? 0
    },

    lastUndoDescription: (state) => (flowId: string): string | null => {
      const stack = state.undoStacks.get(flowId)
      if (!stack || stack.length === 0) return null
      return stack[stack.length - 1].description
    },

    lastRedoDescription: (state) => (flowId: string): string | null => {
      const stack = state.redoStacks.get(flowId)
      if (!stack || stack.length === 0) return null
      return stack[stack.length - 1].description
    },
  },

  actions: {
    /**
     * Record a state change for undo/redo
     */
    recordChange(
      flowId: string,
      before: FlowSnapshot,
      after: FlowSnapshot,
      description: string
    ) {
      // Don't record if we're currently undoing/redoing
      if (this.isUndoingOrRedoing) return

      // Get or create undo stack
      let undoStack = this.undoStacks.get(flowId)
      if (!undoStack) {
        undoStack = []
        this.undoStacks.set(flowId, undoStack)
      }

      // Add entry
      const entry: HistoryEntry = {
        flowId,
        before,
        after,
        description,
      }
      undoStack.push(entry)

      // Trim if exceeds max size
      if (undoStack.length > this.maxHistorySize) {
        undoStack.shift()
      }

      // Clear redo stack on new change
      this.redoStacks.set(flowId, [])
    },

    /**
     * Undo the last change and return the state to restore
     */
    undo(flowId: string): FlowSnapshot | null {
      const undoStack = this.undoStacks.get(flowId)
      if (!undoStack || undoStack.length === 0) return null

      const entry = undoStack.pop()!

      // Add to redo stack
      let redoStack = this.redoStacks.get(flowId)
      if (!redoStack) {
        redoStack = []
        this.redoStacks.set(flowId, redoStack)
      }
      redoStack.push(entry)

      return entry.before
    },

    /**
     * Redo the last undone change and return the state to restore
     */
    redo(flowId: string): FlowSnapshot | null {
      const redoStack = this.redoStacks.get(flowId)
      if (!redoStack || redoStack.length === 0) return null

      const entry = redoStack.pop()!

      // Add back to undo stack
      let undoStack = this.undoStacks.get(flowId)
      if (!undoStack) {
        undoStack = []
        this.undoStacks.set(flowId, undoStack)
      }
      undoStack.push(entry)

      return entry.after
    },

    /**
     * Set the undo/redo flag
     */
    setUndoingOrRedoing(value: boolean) {
      this.isUndoingOrRedoing = value
    },

    /**
     * Clear history for a specific flow
     */
    clearHistory(flowId: string) {
      this.undoStacks.delete(flowId)
      this.redoStacks.delete(flowId)
    },

    /**
     * Clear all history
     */
    clearAllHistory() {
      this.undoStacks.clear()
      this.redoStacks.clear()
    },
  },
})

/**
 * Create a snapshot of the current flow state
 */
export function createSnapshot(nodes: Node[], edges: Edge[]): FlowSnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
    timestamp: Date.now(),
  }
}
