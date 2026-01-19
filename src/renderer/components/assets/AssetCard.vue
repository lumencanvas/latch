<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Trash2, Image, Video, Music, File } from 'lucide-vue-next'
import type { Asset } from '@/services/database'
import { useAssetsStore } from '@/stores/assets'

const props = defineProps<{
  asset: Asset
}>()

const emit = defineEmits<{
  delete: [id: string]
  select: [id: string]
  dragstart: [e: DragEvent, asset: Asset]
}>()

const assetsStore = useAssetsStore()
const thumbnailUrl = ref<string | null>(null)

onMounted(async () => {
  if (props.asset.type === 'image' || props.asset.type === 'video') {
    thumbnailUrl.value = await assetsStore.getThumbnailUrl(props.asset.id)
  }
})

onUnmounted(() => {
  // URLs are managed by the AssetStorage service
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/latch-asset', props.asset.id)
  emit('dragstart', e, props.asset)
}

function onClick() {
  emit('select', props.asset.id)
}

function onDelete(e: Event) {
  e.stopPropagation()
  emit('delete', props.asset.id)
}

const typeIcon = {
  image: Image,
  video: Video,
  audio: Music,
}
</script>

<template>
  <div
    class="asset-card"
    draggable="true"
    @click="onClick"
    @dragstart="onDragStart"
  >
    <!-- Thumbnail -->
    <div class="asset-thumbnail">
      <img
        v-if="thumbnailUrl"
        :src="thumbnailUrl"
        :alt="asset.name"
      >
      <div
        v-else
        class="asset-icon"
      >
        <component
          :is="typeIcon[asset.type] ?? File"
          :size="32"
        />
      </div>

      <!-- Duration badge for video/audio -->
      <span
        v-if="asset.duration"
        class="duration-badge"
      >
        {{ formatDuration(asset.duration) }}
      </span>
    </div>

    <!-- Info -->
    <div class="asset-info">
      <span
        class="asset-name"
        :title="asset.name"
      >
        {{ asset.name }}
      </span>
      <span class="asset-meta">
        {{ formatSize(asset.size) }}
        <template v-if="asset.width && asset.height">
          &middot; {{ asset.width }}x{{ asset.height }}
        </template>
      </span>
    </div>

    <!-- Delete button -->
    <button
      class="delete-btn"
      title="Delete asset"
      @click="onDelete"
    >
      <Trash2 :size="14" />
    </button>
  </div>
</template>

<style scoped>
.asset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.asset-card:hover {
  border-color: var(--color-primary-400);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.asset-card:active {
  cursor: grabbing;
}

.asset-thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--color-neutral-100);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.asset-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-icon {
  color: var(--color-neutral-400);
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-family: var(--font-mono);
  border-radius: var(--radius-xs);
}

.asset-info {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.asset-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-meta {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: var(--radius-xs);
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.asset-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: var(--color-error-500);
}
</style>
