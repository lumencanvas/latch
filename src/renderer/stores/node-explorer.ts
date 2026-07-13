import { defineStore } from 'pinia'

export const useNodeExplorerStore = defineStore('nodeExplorer', {
  state: () => ({
    selectedNodeId: null as string | null,
    // A category id (built-in or drop-in) or null — a plain string so a drop-in
    // category can be selected without a core-type edit.
    selectedCategory: null as string | null,
    searchQuery: '',
    selectedTags: [] as string[],
    viewMode: 'grid' as 'grid' | 'detail',
    activeTab: 'nodes' as 'nodes' | 'snippets',
  }),

  actions: {
    setTab(tab: 'nodes' | 'snippets') {
      this.activeTab = tab
    },

    selectNode(nodeId: string) {
      this.selectedNodeId = nodeId
      this.viewMode = 'detail'
    },

    clearSelection() {
      this.selectedNodeId = null
      this.viewMode = 'grid'
    },

    selectCategory(category: string | null) {
      this.selectedCategory = category
      this.selectedNodeId = null
      // Available tags depend on the category, so a stale selection could filter
      // to nothing — clear it when the category changes.
      this.selectedTags = []
      this.viewMode = 'grid'
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
      if (query) {
        this.selectedNodeId = null
        this.viewMode = 'grid'
      }
    },

    toggleTag(tag: string) {
      const i = this.selectedTags.indexOf(tag)
      if (i === -1) {
        this.selectedTags.push(tag)
      } else {
        this.selectedTags.splice(i, 1)
      }
      this.selectedNodeId = null
      this.viewMode = 'grid'
    },

    clearTags() {
      this.selectedTags = []
    },

    reset() {
      this.selectedNodeId = null
      this.selectedCategory = null
      this.searchQuery = ''
      this.selectedTags = []
      this.viewMode = 'grid'
      this.activeTab = 'nodes'
    },
  },
})
