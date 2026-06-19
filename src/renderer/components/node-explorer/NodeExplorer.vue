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

// Nodes in the selected category (before tag/search narrowing) — drives the
// tag-chip set so chips stay stable while you type or toggle them.
const categoryNodes = computed(() => {
  if (!explorerStore.selectedCategory) return nodesStore.allDefinitions
  return nodesStore.allDefinitions.filter(n => n.category === explorerStore.selectedCategory)
})

// The most common tags in the current category, capped so "All" doesn't explode.
const availableTags = computed(() => {
  const freq = new Map<string, number>()
  for (const node of categoryNodes.value) {
    for (const tag of node.tags ?? []) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([tag]) => tag)
})

const filteredNodes = computed(() => {
  let nodes = categoryNodes.value

  // Filter by selected tags (a node matches if it carries any selected tag)
  if (explorerStore.selectedTags.length) {
    const selected = new Set(explorerStore.selectedTags)
    nodes = nodes.filter(n => (n.tags ?? []).some(t => selected.has(t)))
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

        <!-- Tag filter chips -->
        <div
          v-if="availableTags.length > 0"
          class="tag-filter"
        >
          <button
            v-for="tag in availableTags"
            :key="tag"
            class="tag-chip"
            :class="{ active: explorerStore.selectedTags.includes(tag) }"
            @click="explorerStore.toggleTag(tag)"
          >
            {{ tag }}
          </button>
          <button
            v-if="explorerStore.selectedTags.length > 0"
            class="tag-chip tag-clear"
            @click="explorerStore.clearTags()"
          >
            clear ✕
          </button>
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

.tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
}

.tag-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: lowercase;
  padding: 2px var(--space-2);
  border: 1px solid var(--color-neutral-300);
  background: var(--color-neutral-50);
  color: var(--color-neutral-600);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.tag-chip:hover {
  border-color: var(--color-primary-400);
  color: var(--color-neutral-800);
}

.tag-chip.active {
  background: var(--color-primary-400);
  border-color: var(--color-primary-400);
  color: #fff;
}

.tag-clear {
  border-style: dashed;
  color: var(--color-neutral-500);
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
