<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Image, X, FolderOpen } from 'lucide-vue-next'
import { useAssetsStore, type AssetFilter } from '@/stores/assets'
import type { Asset, AssetType } from '@/services/database'

const props = defineProps<{
  modelValue: string | null // Asset ID
  assetType?: AssetType | 'all' // Filter by type
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const assetsStore = useAssetsStore()
const showPicker = ref(false)
const thumbnailUrl = ref<string | null>(null)

const filterType = computed<AssetFilter>(() => props.assetType ?? 'all')

const filteredAssets = computed(() => {
  if (filterType.value === 'all') {
    return assetsStore.assets
  }
  return assetsStore.assets.filter((a) => a.type === filterType.value)
})

const selectedAsset = computed(() => {
  if (!props.modelValue) return null
  return assetsStore.getAssetById(props.modelValue)
})

// Load assets if not already loaded
onMounted(async () => {
  if (assetsStore.assets.length === 0) {
    await assetsStore.loadAssets()
  }
  await updateThumbnail()
})

watch(() => props.modelValue, updateThumbnail)

async function updateThumbnail() {
  if (props.modelValue) {
    thumbnailUrl.value = await assetsStore.getThumbnailUrl(props.modelValue)
  } else {
    thumbnailUrl.value = null
  }
}

function selectAsset(asset: Asset) {
  emit('update:modelValue', asset.id)
  showPicker.value = false
}

function clearSelection() {
  emit('update:modelValue', null)
}

function togglePicker() {
  showPicker.value = !showPicker.value
}
</script>

<template>
  <div class="asset-picker">
    <label
      v-if="label"
      class="picker-label"
    >
      {{ label }}
    </label>

    <!-- Selected asset preview -->
    <div
      class="asset-preview"
      @click="togglePicker"
    >
      <div
        v-if="selectedAsset"
        class="preview-content"
      >
        <img
          v-if="thumbnailUrl"
          :src="thumbnailUrl"
          :alt="selectedAsset.name"
          class="preview-image"
        >
        <div
          v-else
          class="preview-icon"
        >
          <Image :size="20" />
        </div>
        <span class="preview-name">{{ selectedAsset.name }}</span>
        <button
          class="clear-btn"
          title="Clear selection"
          @click.stop="clearSelection"
        >
          <X :size="14" />
        </button>
      </div>
      <div
        v-else
        class="preview-empty"
      >
        <FolderOpen :size="16" />
        <span>Select asset...</span>
      </div>
    </div>

    <!-- Asset picker dropdown -->
    <div
      v-if="showPicker"
      class="picker-dropdown"
    >
      <div
        v-if="filteredAssets.length === 0"
        class="picker-empty"
      >
        No {{ filterType === 'all' ? 'assets' : filterType + 's' }} available
      </div>

      <div
        v-else
        class="picker-list"
      >
        <button
          v-for="asset in filteredAssets"
          :key="asset.id"
          class="picker-item"
          :class="{ selected: asset.id === modelValue }"
          @click="selectAsset(asset)"
        >
          <div class="item-thumbnail">
            <Image :size="16" />
          </div>
          <div class="item-info">
            <span class="item-name">{{ asset.name }}</span>
            <span class="item-type">{{ asset.type }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Backdrop -->
    <div
      v-if="showPicker"
      class="picker-backdrop"
      @click="showPicker = false"
    />
  </div>
</template>

<style scoped>
.asset-picker {
  position: relative;
  width: 100%;
}

.picker-label {
  display: block;
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
  margin-bottom: var(--space-1);
}

.asset-preview {
  display: flex;
  align-items: center;
  padding: var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-50);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.asset-preview:hover {
  border-color: var(--color-neutral-300);
  background: var(--color-neutral-0);
}

.preview-content {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.preview-image {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: var(--radius-xs);
}

.preview-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
  color: var(--color-neutral-400);
}

.preview-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: var(--color-neutral-200);
  border: none;
  border-radius: var(--radius-xs);
  color: var(--color-neutral-600);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.clear-btn:hover {
  background: var(--color-error-100);
  color: var(--color-error-600);
}

.preview-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-neutral-400);
  font-size: var(--font-size-sm);
}

.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  max-height: 240px;
  overflow-y: auto;
}

.picker-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-sm);
}

.picker-list {
  padding: var(--space-1);
}

.picker-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
}

.picker-item:hover {
  background: var(--color-neutral-100);
}

.picker-item.selected {
  background: var(--color-primary-50);
}

.item-thumbnail {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
  color: var(--color-neutral-400);
}

.item-info {
  flex: 1;
  overflow: hidden;
}

.item-name {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-type {
  display: block;
  font-size: 10px;
  color: var(--color-neutral-400);
  text-transform: capitalize;
}

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
}
</style>
