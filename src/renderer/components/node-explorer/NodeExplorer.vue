<script setup lang="ts">
import { computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { useNodesStore, type NodeCategory } from '@/stores/nodes'
import { useNodeExplorerStore } from '@/stores/node-explorer'
import { flowSnippets } from '@/data/flow-snippets'
import { fuzzySearch } from '@/utils/fuzzySearch'
import CategoryNav from './CategoryNav.vue'
import NodeCard from './NodeCard.vue'
import NodeDetail from './NodeDetail.vue'
import FlowSnippetCard from './FlowSnippet.vue'

const emit = defineEmits<{
  addNode: [nodeId: string]
  insertSnippet: [snippetId: string]
  close: []
}>()

const nodesStore = useNodesStore()
const explorerStore = useNodeExplorerStore()

const filteredNodes = computed(() => {
  let nodes = nodesStore.allDefinitions

  // Filter by category
  if (explorerStore.selectedCategory) {
    nodes = nodes.filter(n => n.category === explorerStore.selectedCategory)
  }

  // Filter by search
  if (explorerStore.searchQuery.trim()) {
    const results = fuzzySearch(
      nodes,
      explorerStore.searchQuery,
      (d) => [d.name, d.description, ...(d.tags ?? [])]
    )
    nodes = results.map(r => r.item)
  }

  return nodes
})

const selectedDefinition = computed(() => {
  if (!explorerStore.selectedNodeId) return null
  return nodesStore.getDefinition(explorerStore.selectedNodeId) ?? null
})

const categorySnippets = computed(() => {
  if (!explorerStore.selectedCategory) return flowSnippets
  return flowSnippets.filter(s => s.category === explorerStore.selectedCategory)
})

function handleSelectNode(nodeId: string) {
  explorerStore.selectNode(nodeId)
}

function handleBack() {
  explorerStore.clearSelection()
}

function handleAddToFlow(nodeId: string) {
  emit('addNode', nodeId)
  emit('close')
}

function handleInsertSnippet(snippetId: string) {
  emit('insertSnippet', snippetId)
  emit('close')
}

function handleNavigateTo(nodeId: string) {
  explorerStore.selectNode(nodeId)
}

function handleSelectCategory(category: NodeCategory | null) {
  explorerStore.selectCategory(category)
}
</script>

<template>
  <div class="node-explorer">
    <!-- Left: Category Navigation -->
    <div class="explorer-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">CATEGORIES</span>
      </div>
      <CategoryNav
        :selected-category="explorerStore.selectedCategory"
        @select="handleSelectCategory"
      />
    </div>

    <!-- Right: Content area -->
    <div class="explorer-content">
      <!-- Detail view -->
      <NodeDetail
        v-if="explorerStore.viewMode === 'detail' && selectedDefinition"
        :definition="selectedDefinition"
        @back="handleBack"
        @add-to-flow="handleAddToFlow"
        @insert-snippet="handleInsertSnippet"
        @navigate-to="handleNavigateTo"
      />

      <!-- Grid view -->
      <template v-else>
        <!-- Search bar -->
        <div class="search-bar">
          <Search
            :size="14"
            class="search-icon"
          />
          <input
            type="text"
            class="search-input"
            placeholder="Search nodes..."
            :value="explorerStore.searchQuery"
            @input="explorerStore.setSearchQuery(($event.target as HTMLInputElement).value)"
          >
        </div>

        <!-- Node grid -->
        <div class="node-grid">
          <NodeCard
            v-for="node in filteredNodes"
            :key="node.id"
            :definition="node"
            @select="handleSelectNode"
          />
        </div>

        <div
          v-if="filteredNodes.length === 0"
          class="empty-state"
        >
          No nodes found.
        </div>

        <!-- Flow snippets -->
        <div
          v-if="categorySnippets.length > 0 && !explorerStore.searchQuery"
          class="snippets-section"
        >
          <h3 class="snippets-title">
            FLOW SNIPPETS
          </h3>
          <div class="snippets-grid">
            <FlowSnippetCard
              v-for="snippet in categorySnippets"
              :key="snippet.id"
              :snippet="snippet"
              @insert="handleInsertSnippet"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.node-explorer {
  display: flex;
  height: 100%;
  font-family: var(--font-mono);
}

.explorer-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 2px solid var(--color-neutral-200);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
}

.sidebar-title {
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-neutral-500);
}

.explorer-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-width: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 2px solid var(--color-neutral-200);
}

.search-icon {
  color: var(--color-neutral-400);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 12px;
  background: transparent;
  color: var(--color-neutral-800);
}

.search-input::placeholder {
  color: var(--color-neutral-400);
}

.node-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
  padding: var(--space-3);
}

.empty-state {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-neutral-400);
  font-size: 12px;
}

.snippets-section {
  padding: var(--space-3);
  border-top: 2px solid var(--color-neutral-200);
}

.snippets-title {
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-neutral-500);
  margin: 0 0 var(--space-3) 0;
}

.snippets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-2);
}
</style>
