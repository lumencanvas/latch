<script setup lang="ts">
import type { FlowSnippet } from '@/data/flow-snippets'

defineProps<{
  snippet: FlowSnippet
}>()

const emit = defineEmits<{
  insert: [snippetId: string]
}>()
</script>

<template>
  <div class="flow-snippet">
    <div class="snippet-info">
      <span class="snippet-name">{{ snippet.name }}</span>
      <span class="snippet-desc">{{ snippet.description }}</span>
      <div class="snippet-nodes">
        <span
          v-for="nodeId in snippet.relatedNodes"
          :key="nodeId"
          class="snippet-node-tag"
        >{{ nodeId }}</span>
      </div>
    </div>
    <button
      class="snippet-btn"
      @click="emit('insert', snippet.id)"
    >
      Insert
    </button>
  </div>
</template>

<style scoped>
.flow-snippet {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 2px solid var(--color-neutral-200);
  background: var(--color-neutral-0);
}

.flow-snippet:hover {
  border-color: var(--color-neutral-300);
}

.snippet-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.snippet-name {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-neutral-800);
}

.snippet-desc {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.snippet-nodes {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.snippet-node-tag {
  font-size: 9px;
  padding: 0 4px;
  background: var(--color-neutral-100);
  color: var(--color-neutral-600);
}

.snippet-btn {
  padding: var(--space-1) var(--space-3);
  background: var(--color-neutral-800);
  border: none;
  color: var(--color-neutral-0);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
}

.snippet-btn:hover {
  background: var(--color-neutral-700);
}
</style>
