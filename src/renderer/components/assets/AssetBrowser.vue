<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Search, Upload, Image, Video, Music, Layers } from 'lucide-vue-next'
import { useAssetsStore, type AssetFilter } from '@/stores/assets'
import AssetCard from './AssetCard.vue'
import type { Asset } from '@/services/database'

const assetsStore = useAssetsStore()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const filterTabs: { id: AssetFilter; label: string; icon: typeof Layers }[] = [
  { id: 'all', label: 'All', icon: Layers },
  { id: 'image', label: 'Images', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
]

// Load assets on mount
onMounted(() => {
  assetsStore.loadAssets()
})

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    await assetsStore.uploadAssets(files)
  }
}

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    await assetsStore.uploadAssets(input.files)
    input.value = '' // Reset input
  }
}

async function onDeleteAsset(id: string) {
  if (confirm('Delete this asset?')) {
    await assetsStore.deleteAsset(id)
  }
}

function onSelectAsset(id: string) {
  assetsStore.selectAsset(id)
}

function onAssetDragStart(e: DragEvent, asset: Asset) {
  // Already handled in AssetCard
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
</script>

<template>
  <div class="asset-browser">
    <!-- Search -->
    <div class="search-wrapper">
      <Search class="search-icon" />
      <input
        type="text"
        class="search-input"
        placeholder="Search assets..."
        :value="assetsStore.searchQuery"
        @input="assetsStore.setSearchQuery(($event.target as HTMLInputElement).value)"
      >
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs">
      <button
        v-for="tab in filterTabs"
        :key="tab.id"
        class="filter-tab"
        :class="{ active: assetsStore.filter === tab.id }"
        @click="assetsStore.setFilter(tab.id)"
      >
        <component
          :is="tab.icon"
          :size="14"
        />
        <span>{{ tab.label }}</span>
        <span class="count">{{ assetsStore.assetCounts[tab.id] }}</span>
      </button>
    </div>

    <!-- Drop zone / Upload -->
    <div
      class="drop-zone"
      :class="{ dragging: isDragging }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @click="openFilePicker"
    >
      <Upload :size="20" />
      <span>Drop files or click to upload</span>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        class="file-input"
        @change="onFileSelect"
      >
    </div>

    <!-- Asset grid -->
    <div class="asset-list">
      <div
        v-if="assetsStore.loading"
        class="loading"
      >
        Loading assets...
      </div>

      <div
        v-else-if="assetsStore.filteredAssets.length === 0"
        class="empty"
      >
        <template v-if="assetsStore.searchQuery">
          No assets match "{{ assetsStore.searchQuery }}"
        </template>
        <template v-else>
          No assets yet. Upload some files!
        </template>
      </div>

      <div
        v-else
        class="asset-grid"
      >
        <AssetCard
          v-for="asset in assetsStore.filteredAssets"
          :key="asset.id"
          :asset="asset"
          @delete="onDeleteAsset"
          @select="onSelectAsset"
          @dragstart="onAssetDragStart"
        />
      </div>
    </div>

    <!-- Footer stats -->
    <div class="browser-footer">
      <span>{{ assetsStore.assets.length }} assets</span>
      <span>&middot;</span>
      <span>{{ formatSize(assetsStore.totalSize) }}</span>
    </div>
  </div>
</template>

<style scoped>
.asset-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
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

.filter-tabs {
  display: flex;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-neutral-100);
  background: var(--color-neutral-50);
}

.filter-tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--color-neutral-600);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-tab:hover {
  background: var(--color-neutral-100);
}

.filter-tab.active {
  background: var(--color-primary-100);
  color: var(--color-primary-700);
}

.filter-tab .count {
  font-size: 10px;
  background: var(--color-neutral-200);
  padding: 0 4px;
  border-radius: 8px;
}

.filter-tab.active .count {
  background: var(--color-primary-200);
}

.drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-3);
  padding: var(--space-4);
  border: 2px dashed var(--color-neutral-300);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-50);
  color: var(--color-neutral-500);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--color-primary-400);
  background: var(--color-primary-50);
  color: var(--color-primary-600);
}

.file-input {
  display: none;
}

.asset-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3);
}

.loading,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  color: var(--color-neutral-400);
  font-size: var(--font-size-sm);
  text-align: center;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.browser-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-top: 1px solid var(--color-neutral-100);
  background: var(--color-neutral-50);
  font-size: 10px;
  color: var(--color-neutral-500);
}
</style>
