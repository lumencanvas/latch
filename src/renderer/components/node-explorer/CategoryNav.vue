<script setup lang="ts">
import { computed } from 'vue'
import { categoryMeta, type NodeCategory, useNodesStore } from '@/stores/nodes'
import { categoryIcons } from '@/utils/categoryIcons'

defineProps<{
  selectedCategory: NodeCategory | null
}>()

const emit = defineEmits<{
  select: [category: NodeCategory | null]
}>()

const nodesStore = useNodesStore()

// Only show categories that actually have nodes — keeps empty buckets
// (shaders, custom) out of the explorer.
const categories = computed(() =>
  (Object.entries(categoryMeta) as [NodeCategory, { label: string; icon: string; color: string }][])
    .filter(([key]) => (nodesStore.byCategory.get(key)?.length ?? 0) > 0)
)
</script>

<template>
  <nav class="category-nav">
    <button
      class="cat-item"
      :class="{ active: selectedCategory === null }"
      @click="emit('select', null)"
    >
      <span
        class="cat-dot"
        style="background: var(--color-neutral-400)"
      />
      <span class="cat-label">All</span>
      <span class="cat-count">{{ nodesStore.definitions.size }}</span>
    </button>
    <button
      v-for="[key, meta] in categories"
      :key="key"
      class="cat-item"
      :class="{ active: selectedCategory === key }"
      @click="emit('select', key)"
    >
      <span
        class="cat-icon"
        :style="{ color: meta.color }"
      >
        <component
          :is="categoryIcons[key]"
          :size="13"
        />
      </span>
      <span class="cat-label">{{ meta.label }}</span>
      <span class="cat-count">{{ nodesStore.byCategory.get(key)?.length ?? 0 }}</span>
    </button>
  </nav>
</template>

<style scoped>
.category-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
}

.cat-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-neutral-600);
  text-align: left;
  transition: background 0.1s;
}

.cat-item:hover {
  background: var(--color-neutral-100);
}

.cat-item.active {
  background: var(--color-neutral-200);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.cat-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.cat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  flex-shrink: 0;
}

.cat-label {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cat-count {
  font-size: 9px;
  color: var(--color-neutral-400);
}
</style>
