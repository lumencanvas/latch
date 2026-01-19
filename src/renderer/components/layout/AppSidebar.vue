<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useNodesStore, categoryMeta, type NodeCategory, type NodeDefinition } from '@/stores/nodes'
import { Search, PanelLeftClose, PanelLeft, ChevronDown, ChevronRight, Brain, Download, Blocks, FolderOpen } from 'lucide-vue-next'
import { aiInference } from '@/services/ai/AIInference'
import AssetBrowser from '@/components/assets/AssetBrowser.vue'

const uiStore = useUIStore()
const nodesStore = useNodesStore()

// Tab state
type SidebarTab = 'nodes' | 'assets'
const activeTab = ref<SidebarTab>('nodes')

// All categories collapsed by default
function getAllCategoriesCollapsed(): Set<string> {
  return new Set(Object.keys(categoryMeta))
}

// Track collapsed categories (stored locally, could be persisted)
const collapsedCategories = ref<Set<string>>(getAllCategoriesCollapsed())

// Track dropdown open state
const dropdownOpen = ref(false)

// Track if any AI models are loaded
const hasLoadedModels = ref(false)
let aiUnsubscribe: (() => void) | null = null

onMounted(() => {
  updateAIModelStatus()
  aiUnsubscribe = aiInference.subscribe(() => {
    updateAIModelStatus()
  })
  // Close dropdown on outside click
  document.addEventListener('click', handleClickOutside)
})

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.custom-select')) {
    dropdownOpen.value = false
  }
}

onUnmounted(() => {
  aiUnsubscribe?.()
  document.removeEventListener('click', handleClickOutside)
})

function updateAIModelStatus() {
  const state = aiInference.getState()
  hasLoadedModels.value = state.loadedModels.size > 0
}

const sidebarStyle = computed(() => ({
  width: uiStore.sidebarOpen ? `${uiStore.sidebarWidth}px` : '0px',
}))

// Get all categories with their metadata
const categories = computed(() => {
  return Object.entries(categoryMeta) as [NodeCategory, typeof categoryMeta[NodeCategory]][]
})

// Get node counts per category
const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const def of nodesStore.definitions.values()) {
    counts[def.category] = (counts[def.category] ?? 0) + 1
  }
  return counts
})

// Group nodes by category (considering search and filter)
const nodesByCategory = computed(() => {
  const groups = new Map<string, NodeDefinition[]>()

  // Initialize all categories
  for (const [id] of categories.value) {
    groups.set(id, [])
  }

  // Get filtered definitions (respects search and category filter)
  const filtered = nodesStore.filteredDefinitions

  // Group by category
  for (const def of filtered) {
    const categoryNodes = groups.get(def.category) ?? []
    categoryNodes.push(def)
    groups.set(def.category, categoryNodes)
  }

  return groups
})

// Categories that have nodes to show
const visibleCategories = computed(() => {
  return categories.value.filter(([id]) => {
    const nodes = nodesByCategory.value.get(id)
    return nodes && nodes.length > 0
  })
})

// Note: Category filter dropdown is handled inline in template, keeping this for reference
// function onCategoryFilterChange(event: Event) {
//   const value = (event.target as HTMLSelectElement).value
//   nodesStore.setCategoryFilter(value === 'all' ? null : value as NodeCategory)
// }

// Toggle custom dropdown
function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

// Select category from custom dropdown
function selectCategory(categoryId: NodeCategory | null) {
  nodesStore.setCategoryFilter(categoryId)
  dropdownOpen.value = false
}

// Toggle category collapse
function toggleCategory(categoryId: string) {
  if (collapsedCategories.value.has(categoryId)) {
    collapsedCategories.value.delete(categoryId)
  } else {
    collapsedCategories.value.add(categoryId)
  }
}

// Check if a category is collapsed
function isCategoryCollapsed(categoryId: string): boolean {
  return collapsedCategories.value.has(categoryId)
}

// Handle node drag start
function onDragStart(event: DragEvent, nodeId: string) {
  event.dataTransfer?.setData('application/clasp-node', nodeId)
}

// Open AI model manager
function openAIModelManager() {
  uiStore.openAIModelManager()
}
</script>

<template>
  <aside
    class="app-sidebar"
    :style="sidebarStyle"
  >
    <div
      v-if="uiStore.sidebarOpen"
      class="sidebar-content"
    >
      <!-- Header with tabs -->
      <div class="sidebar-header">
        <div class="sidebar-tabs">
          <button
            class="sidebar-tab"
            :class="{ active: activeTab === 'nodes' }"
            @click="activeTab = 'nodes'"
          >
            <Blocks :size="14" />
            <span>Nodes</span>
          </button>
          <button
            class="sidebar-tab"
            :class="{ active: activeTab === 'assets' }"
            @click="activeTab = 'assets'"
          >
            <FolderOpen :size="14" />
            <span>Assets</span>
          </button>
        </div>
        <button
          class="collapse-btn"
          title="Collapse sidebar"
          @click="uiStore.toggleSidebar"
        >
          <PanelLeftClose :size="16" />
        </button>
      </div>

      <!-- Assets Tab -->
      <AssetBrowser v-if="activeTab === 'assets'" />

      <!-- Nodes Tab -->
      <template v-else>
        <!-- Search -->
        <div class="search-wrapper">
          <Search class="search-icon" />
          <input
            type="text"
            class="search-input"
            placeholder="Search nodes..."
            :value="nodesStore.searchQuery"
            @input="nodesStore.setSearchQuery(($event.target as HTMLInputElement).value)"
          >
        </div>

      <!-- Category Filter Dropdown -->
      <div class="filter-wrapper">
        <label class="filter-label">Filter by category</label>
        <div
          class="custom-select"
          @click="toggleDropdown"
        >
          <div class="select-display">
            <span
              v-if="nodesStore.categoryFilter"
              class="select-color"
              :style="{ background: categoryMeta[nodesStore.categoryFilter]?.color }"
            />
            <span class="select-text">
              {{ nodesStore.categoryFilter ? categoryMeta[nodesStore.categoryFilter]?.label : 'All Categories' }}
              ({{ nodesStore.categoryFilter ? (categoryCounts[nodesStore.categoryFilter] ?? 0) : nodesStore.definitions.size }})
            </span>
            <ChevronDown
              :size="14"
              class="select-arrow"
            />
          </div>
          <div
            v-if="dropdownOpen"
            class="select-options"
          >
            <div
              class="select-option"
              :class="{ active: !nodesStore.categoryFilter }"
              @click.stop="selectCategory(null)"
            >
              <span class="option-color all-color" />
              <span>All Categories ({{ nodesStore.definitions.size }})</span>
            </div>
            <div
              v-for="[id, meta] in categories"
              :key="id"
              class="select-option"
              :class="{ active: nodesStore.categoryFilter === id }"
              @click.stop="selectCategory(id)"
            >
              <span
                class="option-color"
                :style="{ background: meta.color }"
              />
              <span>{{ meta.label }} ({{ categoryCounts[id] ?? 0 }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Node List with Collapsible Sections -->
      <div class="node-list">
        <template v-if="visibleCategories.length > 0">
          <div
            v-for="[categoryId, meta] in visibleCategories"
            :key="categoryId"
            class="category-section"
          >
            <!-- Category Header -->
            <div
              class="category-header-row"
              :class="{ 'is-ai': categoryId === 'ai' }"
            >
              <button
                class="category-header"
                :style="{ '--category-color': meta.color }"
                @click="toggleCategory(categoryId)"
              >
                <span class="category-expand">
                  <ChevronRight
                    v-if="isCategoryCollapsed(categoryId)"
                    :size="14"
                  />
                  <ChevronDown
                    v-else
                    :size="14"
                  />
                </span>
                <span
                  v-if="categoryId === 'ai'"
                  class="category-icon ai-icon"
                >
                  <Brain :size="12" />
                </span>
                <span
                  v-else
                  class="category-color"
                  :style="{ background: meta.color }"
                />
                <span class="category-name">{{ meta.label }}</span>
                <span class="category-count">{{ nodesByCategory.get(categoryId)?.length ?? 0 }}</span>
              </button>

              <!-- AI Load Models Button -->
              <button
                v-if="categoryId === 'ai' && !hasLoadedModels"
                class="ai-load-btn"
                title="Load Local AI Models"
                @click.stop="openAIModelManager"
              >
                <Download :size="12" />
                <span>Load Models</span>
              </button>
            </div>

            <!-- Category Nodes -->
            <div
              v-if="!isCategoryCollapsed(categoryId)"
              class="category-nodes"
            >
              <div
                v-for="node in nodesByCategory.get(categoryId)"
                :key="node.id"
                class="node-item"
                draggable="true"
                @dragstart="(e) => onDragStart(e, node.id)"
              >
                <span
                  class="node-item-color"
                  :style="{ background: meta.color }"
                />
                <div class="node-item-info">
                  <span class="node-item-name">{{ node.name }}</span>
                  <span class="node-item-desc">{{ node.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div
          v-else
          class="no-results"
        >
          No nodes found
        </div>
      </div>
      </template>
    </div>

    <!-- Collapsed state - show expand button -->
    <button
      v-if="!uiStore.sidebarOpen"
      class="expand-btn"
      title="Expand sidebar"
      @click="uiStore.toggleSidebar"
    >
      <PanelLeft :size="18" />
    </button>
  </aside>
</template>

<style scoped>
.app-sidebar {
  background: var(--color-neutral-0);
  border-right: 1px solid var(--color-neutral-200);
  overflow: hidden;
  transition: width var(--transition-default);
  flex-shrink: 0;
  position: relative;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-width: 200px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
}

.sidebar-tabs {
  display: flex;
  gap: 2px;
}

.sidebar-tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sidebar-tab:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}

.sidebar-tab.active {
  background: var(--color-primary-100);
  color: var(--color-primary-700);
}

.sidebar-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-600);
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.collapse-btn:hover {
  color: var(--color-neutral-700);
}

.expand-btn {
  position: absolute;
  top: var(--space-3);
  left: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.expand-btn:hover {
  background: var(--color-neutral-50);
  color: var(--color-neutral-700);
}

.search-wrapper {
  position: relative;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-100);
}

.search-icon {
  position: absolute;
  left: calc(var(--space-3) + var(--space-2));
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--color-neutral-400);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 20px);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

/* Filter Dropdown */
.filter-wrapper {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-100);
}

.filter-label {
  display: block;
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
  margin-bottom: var(--space-2);
}

.filter-select {
  width: 100%;
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  cursor: pointer;
  color: var(--color-neutral-700);
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

/* Custom Select Dropdown */
.custom-select {
  position: relative;
  cursor: pointer;
}

.select-display {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  transition: all var(--transition-fast);
}

.select-display:hover {
  border-color: var(--color-neutral-300);
  background: var(--color-neutral-0);
}

.select-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.select-text {
  flex: 1;
  color: var(--color-neutral-700);
}

.select-arrow {
  color: var(--color-neutral-400);
  flex-shrink: 0;
}

.select-options {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 2px;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.select-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.select-option:hover {
  background: var(--color-neutral-100);
}

.select-option.active {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}

.option-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.option-color.all-color {
  background: linear-gradient(135deg, #EF4444 0%, #F59E0B 25%, #10B981 50%, #3B82F6 75%, #8B5CF6 100%);
}

/* Node List with Collapsible Sections */
.node-list {
  flex: 1;
  overflow-y: auto;
}

.category-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

.category-header-row {
  display: flex;
  align-items: center;
  background: var(--color-neutral-50);
}

.category-header-row.is-ai {
  background: linear-gradient(90deg, var(--color-neutral-50) 0%, rgba(168, 85, 247, 0.08) 100%);
}

.category-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.category-header:hover {
  background: var(--color-neutral-100);
}

.category-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.ai-icon {
  background: #A855F7;
  color: white;
}

.ai-load-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 4px var(--space-2);
  margin-right: var(--space-2);
  background: #A855F7;
  border: none;
  border-radius: var(--radius-xs);
  color: white;
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.ai-load-btn:hover {
  background: #9333EA;
}

.category-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-400);
}

.category-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.category-name {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-700);
  text-align: left;
}

.category-count {
  font-size: 10px;
  color: var(--color-neutral-400);
  background: var(--color-neutral-200);
  padding: 1px 6px;
  border-radius: 10px;
}

.category-nodes {
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-0);
}

.node-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  cursor: grab;
  border-radius: var(--radius-xs);
  transition: all var(--transition-fast);
  border: 1px solid transparent;
  margin: 2px 0;
}

.node-item:hover {
  background: var(--color-neutral-50);
  border-color: var(--color-neutral-200);
}

.node-item:active {
  cursor: grabbing;
  background: var(--color-neutral-100);
}

.node-item-color {
  width: 3px;
  height: 100%;
  min-height: 32px;
  border-radius: 1px;
  flex-shrink: 0;
}

.node-item-info {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-item-name {
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-800);
}

.node-item-desc {
  font-size: 10px;
  color: var(--color-neutral-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-results {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-sm);
}
</style>
