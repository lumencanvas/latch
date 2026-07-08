<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { Search } from 'lucide-vue-next'
import { useNodesStore, dataTypeMeta, type NodeCategory, type DataType } from '@/stores/nodes'
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

// Snippets narrow with the search box too (they used to disappear the moment you
// typed), so a snippet is findable by name/description — not only by category.
const visibleSnippets = computed(() => {
  const query = explorerStore.searchQuery.trim()
  if (!query) return categorySnippets.value
  return fuzzySearch(categorySnippets.value, query, s => [s.name, s.description]).map(r => r.item)
})

// The node grid, so we can return keyboard focus to the originating card when the
// detail view closes (WCAG 2.4.3 — the swap must not strand focus on <body>).
const gridRef = ref<HTMLElement | null>(null)

function handleSelectNode(nodeId: string) {
  explorerStore.selectNode(nodeId)
}

function handleBack() {
  // Capture which node we were viewing before clearing it, then restore focus to
  // its card once the grid has re-rendered.
  const returningTo = explorerStore.selectedNodeId
  explorerStore.clearSelection()
  if (!returningTo) return
  nextTick(() => {
    gridRef.value
      ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(returningTo)}"]`)
      ?.focus()
  })
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

// The two top-level sections of the explorer, driven as an ARIA tablist (roving
// tabindex + arrow keys) — the same keyboard model as the flow tabs.
const tabs = [
  { id: 'nodes', label: 'Nodes' },
  { id: 'snippets', label: 'Snippets' },
] as const

function onTabKeydown(event: KeyboardEvent, tab: 'nodes' | 'snippets') {
  const el = event.currentTarget as HTMLElement
  const focusSibling = (sibling: Element | null | undefined) => {
    const next = sibling as HTMLElement | null
    if (!next) return
    const id = next.dataset.tab as 'nodes' | 'snippets' | undefined
    if (id) explorerStore.setTab(id)
    next.focus()
  }

  switch (event.key) {
    case 'Enter':
    case ' ':
      event.preventDefault()
      explorerStore.setTab(tab)
      break
    case 'ArrowRight':
      event.preventDefault()
      focusSibling(el.nextElementSibling)
      break
    case 'ArrowLeft':
      event.preventDefault()
      focusSibling(el.previousElementSibling)
      break
    case 'Home':
      event.preventDefault()
      focusSibling(el.parentElement?.firstElementChild)
      break
    case 'End':
      event.preventDefault()
      focusSibling(el.parentElement?.lastElementChild)
      break
  }
}

// Port type key — the colour, non-colour line style (solid/dotted/dashed, shared
// by a port and its edge) and the glyph shown on hover, all from dataTypeMeta so
// the legend documents every cue a handle actually carries (WCAG 1.4.1).
const legendTypes = (['trigger', 'number', 'string', 'boolean', 'audio', 'video', 'texture', 'array', 'data', 'any'] as DataType[])
  .map(type => ({
    type,
    label: dataTypeMeta[type].label,
    color: dataTypeMeta[type].color,
    lineStyle: dataTypeMeta[type].lineStyle,
    glyph: dataTypeMeta[type].glyph,
  }))
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

      <!-- Port colour key -->
      <div class="port-legend">
        <span class="legend-title">PORT TYPES</span>
        <div class="legend-list">
          <div
            v-for="t in legendTypes"
            :key="t.type"
            class="legend-item"
          >
            <!-- Swatch mirrors the port: solid types are a filled dot, dotted/dashed
                 types a hollow ring in the type colour (the shared port/edge cue). -->
            <span
              class="legend-swatch"
              :class="`line-${t.lineStyle}`"
              :style="t.lineStyle === 'solid'
                ? { background: t.color }
                : { borderColor: t.color }"
            />
            <span
              class="legend-glyph"
              :style="{ color: t.color }"
            >{{ t.glyph }}</span>
            <span class="legend-label">{{ t.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Content area -->
    <div class="explorer-content">
      <!-- Section tabs: nodes / snippets. Only the active tabpanel is rendered
           (the node grid mounts all ~238 cards, so keeping both mounted is
           wasteful), so the tabs deliberately omit `aria-controls` — per WAI-ARIA
           APG, a tab should not reference a panel that isn't in the DOM. The
           panel→tab link (`aria-labelledby`) is kept. -->
      <div
        class="explorer-tabs"
        role="tablist"
        aria-label="Node explorer sections"
      >
        <button
          v-for="tab in tabs"
          :id="`explorer-tab-${tab.id}`"
          :key="tab.id"
          :data-tab="tab.id"
          type="button"
          class="explorer-tab"
          :class="{ active: explorerStore.activeTab === tab.id }"
          role="tab"
          :aria-selected="explorerStore.activeTab === tab.id"
          :tabindex="explorerStore.activeTab === tab.id ? 0 : -1"
          @click="explorerStore.setTab(tab.id)"
          @keydown="onTabKeydown($event, tab.id)"
        >
          {{ tab.label }}
          <span
            v-if="tab.id === 'snippets'"
            class="tab-count"
          >{{ visibleSnippets.length }}</span>
        </button>
      </div>

      <!-- Nodes panel -->
      <div
        v-if="explorerStore.activeTab === 'nodes'"
        id="explorer-panel-nodes"
        class="explorer-panel"
        role="tabpanel"
        aria-labelledby="explorer-tab-nodes"
      >
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
              aria-label="Search nodes"
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
              :aria-pressed="explorerStore.selectedTags.includes(tag)"
              @click="explorerStore.toggleTag(tag)"
            >
              <!-- Non-color cue (WCAG 1.4.1): a check marks the active chip so its
                   state does not rely on the primary-colour fill alone. -->
              <span
                v-if="explorerStore.selectedTags.includes(tag)"
                class="tag-check"
                aria-hidden="true"
              >✓ </span>{{ tag }}
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
          <div
            ref="gridRef"
            class="node-grid"
          >
            <NodeCard
              v-for="node in filteredNodes"
              :key="node.id"
              :data-node-id="node.id"
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
        </template>
      </div>

      <!-- Snippets panel -->
      <div
        v-else
        id="explorer-panel-snippets"
        class="explorer-panel"
        role="tabpanel"
        aria-labelledby="explorer-tab-snippets"
      >
        <!-- Search bar -->
        <div class="search-bar">
          <Search
            :size="14"
            class="search-icon"
          />
          <input
            type="text"
            class="search-input"
            placeholder="Search snippets..."
            aria-label="Search snippets"
            :value="explorerStore.searchQuery"
            @input="explorerStore.setSearchQuery(($event.target as HTMLInputElement).value)"
          >
        </div>

        <div
          v-if="visibleSnippets.length > 0"
          class="snippets-grid"
        >
          <FlowSnippetCard
            v-for="snippet in visibleSnippets"
            :key="snippet.id"
            :snippet="snippet"
            @insert="handleInsertSnippet"
          />
        </div>
        <div
          v-else
          class="empty-state"
        >
          No snippets found.
        </div>
      </div>
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

/* Section tabs (nodes / snippets) — pinned to the top of the scrolling content. */
.explorer-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) 0;
  border-bottom: 2px solid var(--color-neutral-200);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-neutral-0);
}

.explorer-tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}

.explorer-tab:hover {
  color: var(--color-neutral-800);
}

.explorer-tab.active {
  color: var(--color-neutral-900);
  border-bottom-color: var(--color-primary-500);
}

.explorer-tab:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: -2px;
}

.tab-count {
  font-size: 9px;
  line-height: 16px;
  min-width: 16px;
  padding: 0 5px;
  text-align: center;
  border-radius: var(--radius-full);
  background: var(--color-neutral-200);
  color: var(--color-neutral-600);
}

.explorer-panel {
  display: flex;
  flex-direction: column;
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

/* Restore a keyboard focus ring the base `outline: none` suppressed (WCAG 2.4.7).
   The borderless, transparent input has no other focus affordance. */
.search-input:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
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

.snippets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-2);
  padding: var(--space-3);
}

/* Let the category list scroll so the port legend stays pinned to the bottom. */
.explorer-sidebar :deep(.category-nav) {
  flex: 1;
  min-height: 0;
}

.port-legend {
  flex-shrink: 0;
  border-top: 1px solid var(--color-neutral-200);
  padding: var(--space-3);
}

.legend-title {
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-neutral-500);
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: var(--space-2);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* Mirror the port dot: solid = filled, dotted/dashed = hollow ring (the non-colour
   cue a port shares with its edge). */
.legend-swatch.line-dotted {
  background: transparent;
  border: 2px dotted;
}

.legend-swatch.line-dashed {
  background: transparent;
  border: 2px dashed;
}

.legend-glyph {
  width: 10px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-align: center;
}

.legend-label {
  font-size: 10px;
  color: var(--color-neutral-600);
  text-transform: capitalize;
}
</style>
