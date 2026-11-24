<script setup lang="ts">
import { REQUIREMENT_LABELS, type FlowSnippet } from '@/data/flow-snippets'
import { useNodesStore } from '@/stores/nodes'
import { nodeTypeColor } from '@/utils/nodeColor'
import FlowPreview from '@/components/preview/FlowPreview.vue'

defineProps<{
  snippet: FlowSnippet
}>()

const emit = defineEmits<{
  insert: [snippetId: string]
}>()

const nodesStore = useNodesStore()

// Colour a preview node by its category (neutral fallback for unknown types).
const nodeColor = (nodeType: string) =>
  nodeTypeColor(nodeType, (t) => nodesStore.getDefinition(t)?.category)
</script>

<template>
  <div class="flow-snippet">
    <FlowPreview
      class="snippet-thumb"
      :nodes="snippet.nodes"
      :edges="snippet.edges"
      :get-color="nodeColor"
    />
    <div class="snippet-info">
      <span class="snippet-name">{{ snippet.name }}</span>
      <span class="snippet-desc">{{ snippet.description }}</span>
      <span
        v-if="snippet.requires?.length"
        class="snippet-needs"
      >Needs: {{ snippet.requires.map(r => REQUIREMENT_LABELS[r]).join(' · ') }}</span>
      <span
        v-if="snippet.setup"
        class="snippet-setup"
      >Setup: {{ snippet.setup }}</span>
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
      :aria-label="`Insert ${snippet.name}`"
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

.snippet-thumb {
  width: 56px;
  height: 40px;
  flex-shrink: 0;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xs);
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

.snippet-needs,
.snippet-setup {
  font-size: 10px;
  color: var(--color-neutral-600);
}

.snippet-needs {
  font-weight: var(--font-weight-bold);
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
