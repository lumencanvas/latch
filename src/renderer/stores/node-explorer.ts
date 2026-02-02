import { defineStore } from 'pinia'
import type { NodeCategory } from './nodes'

export const useNodeExplorerStore = defineStore('nodeExplorer', {
  state: () => ({
    selectedNodeId: null as string | null,
    selectedCategory: null as NodeCategory | null,
    searchQuery: '',
    viewMode: 'grid' as 'grid' | 'detail',
  }),

  actions: {
    selectNode(nodeId: string) {
      this.selectedNodeId = nodeId
      this.viewMode = 'detail'
    },

    clearSelection() {
      this.selectedNodeId = null
      this.viewMode = 'grid'
    },

    selectCategory(category: NodeCategory | null) {
      this.selectedCategory = category
      this.selectedNodeId = null
      this.viewMode = 'grid'
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
      if (query) {
        this.selectedNodeId = null
        this.viewMode = 'grid'
      }
    },

    reset() {
      this.selectedNodeId = null
      this.selectedCategory = null
      this.searchQuery = ''
      this.viewMode = 'grid'
    },
  },
})
