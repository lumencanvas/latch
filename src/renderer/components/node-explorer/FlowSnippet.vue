<script setup lang="ts">
import { REQUIREMENT_LABELS, type FlowSnippet } from '@/data/flow-snippets'
import { useNodesStore } from '@/stores/nodes'
import { nodeTypeColor } from '@/utils/nodeColor'
import FlowPreview from '@/components/preview/FlowPreview.vue'

defineProps<{
  snippet: FlowSnippet
}>()

const MAX_TAGS = 4

const emit = defineEmits<{
  insert: [snippetId: string]
  open: [snippetId: string]
}>()

const nodesStore = useNodesStore()

// Colour a preview node by its category (neutral fallback for unknown types).
const nodeColor = (nodeType: string) =>
  nodeTypeColor(nodeType, (t) => nodesStore.getDefinition(t)?.category)
</script>

<template>
  <div class="flow-snippet">
    <div class="snippet-head">
      <FlowPreview
        class="snippet-thumb"
        :nodes="snippet.nodes"
        :edges="snippet.edges"
        :get-color="nodeColor"
      />
      <div class="snippet-title">
        <span class="snippet-name">{{ snippet.name }}</span>
        <span
          v-if="snippet.requires?.length"
          class="snippet-needs"
        >Needs {{ snippet.requires.map(r => REQUIREMENT_LABELS[r]).join(' · ') }}</span>
      </div>
    </div>
    <p
      class="snippet-desc"
      :title="snippet.description"
    >
      {{ snippet.description }}
    </p>
    <span
      v-if="snippet.setup"
      class="snippet-setup"
      :title="snippet.setup"
    >Setup: {{ snippet.setup }}</span>
    <div class="snippet-nodes">
      <span
        v-for="nodeId in snippet.relatedNodes.slice(0, MAX_TAGS)"
        :key="nodeId"
        class="snippet-node-tag"
      >{{ nodeId }}</span>
      <span
        v-if="snippet.relatedNodes.length > MAX_TAGS"
        class="snippet-node-tag snippet-node-more"
        :title="snippet.relatedNodes.slice(MAX_TAGS).join(', ')"
      >+{{ snippet.relatedNodes.length - MAX_TAGS }}</span>
    </div>
    <div class="snippet-actions">
      <button
        class="snippet-btn"
        :aria-label="`Insert ${snippet.name}`"
        title="Place it on this canvas: it follows your cursor until you click"
        @click="emit('insert', snippet.id)"
      >
        Insert
      </button>
      <button
        class="snippet-btn snippet-btn-secondary"
        :aria-label="`Open ${snippet.name} as a new flow`"
        title="Open it in its own new flow tab"
        @click="emit('open', snippet.id)"
      >
        Open as New
      </button>
    </div>
  </div>
</template>

<style scoped>
.flow-snippet {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  min-width: 0;
  padding: var(--space-3);
  border: 2px solid var(--color-neutral-200);
  background: var(--color-neutral-0);
}

.flow-snippet:hover {
  border-color: var(--color-neutral-300);
}

.snippet-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.snippet-thumb {
  width: 64px;
  height: 44px;
  flex-shrink: 0;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xs);
}

.snippet-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.snippet-name {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-neutral-800);
  line-height: 1.3;
}

.snippet-needs {
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-600);
}

/* Long descriptions are cut at three lines (full text on hover) so cards stay one size. */
.snippet-desc {
  margin: 0;
  font-size: 10px;
  line-height: 1.45;
  color: var(--color-neutral-500);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.snippet-setup {
  font-size: 10px;
  color: var(--color-neutral-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.snippet-nodes {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  max-height: 34px;
  overflow: hidden;
}

.snippet-node-tag {
  font-size: 9px;
  padding: 0 4px;
  background: var(--color-neutral-100);
  color: var(--color-neutral-600);
  font-family: var(--font-mono);
}

.snippet-node-more {
  font-weight: var(--font-weight-bold);
}

.snippet-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: auto;
}

.snippet-btn {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-800);
  border: 2px solid var(--color-neutral-800);
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

.snippet-btn-secondary {
  background: transparent;
  color: var(--color-neutral-800);
}

.snippet-btn-secondary:hover {
  background: var(--color-neutral-100);
}

.snippet-btn:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: 2px;
}
</style>
