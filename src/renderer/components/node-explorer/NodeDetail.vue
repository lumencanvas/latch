<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { flowSnippets } from '@/data/flow-snippets'

const props = defineProps<{
  definition: NodeDefinition
}>()

const emit = defineEmits<{
  back: []
  addToFlow: [nodeId: string]
  insertSnippet: [snippetId: string]
  navigateTo: [nodeId: string]
}>()

const nodesStore = useNodesStore()

const color = computed(() => categoryMeta[props.definition.category]?.color ?? '#6B7280')
const categoryLabel = computed(() => categoryMeta[props.definition.category]?.label ?? props.definition.category)

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

function getTypeName(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.label ?? type
}

const relatedSnippets = computed(() => {
  return flowSnippets.filter(s => s.relatedNodes.includes(props.definition.id))
})

const pairsWithNodes = computed(() => {
  if (!props.definition.info?.pairsWith) return []
  return props.definition.info.pairsWith
    .map(id => nodesStore.getDefinition(id))
    .filter((d): d is NodeDefinition => d !== undefined)
})
</script>

<template>
  <div class="node-detail">
    <div class="detail-header">
      <button
        class="back-btn"
        @click="emit('back')"
      >
        <ArrowLeft :size="14" />
        <span>Back</span>
      </button>
      <span
        class="detail-category"
        :style="{ color }"
      >{{ categoryLabel }}</span>
    </div>

    <h2 class="detail-name">
      {{ definition.name }}
    </h2>

    <p
      v-if="definition.info?.overview"
      class="detail-overview"
    >
      {{ definition.info.overview }}
    </p>
    <p
      v-else
      class="detail-overview"
    >
      {{ definition.description }}
    </p>

    <!-- Inputs -->
    <div
      v-if="definition.inputs.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        INPUTS
      </h3>
      <div class="port-list">
        <div
          v-for="input in definition.inputs"
          :key="input.id"
          class="port-item"
        >
          <span
            class="port-dot"
            :style="{ background: getTypeColor(input.type) }"
          />
          <span class="port-name">{{ input.label }}</span>
          <span
            class="port-type"
            :style="{ color: getTypeColor(input.type) }"
          >{{ getTypeName(input.type) }}</span>
        </div>
      </div>
    </div>

    <!-- Outputs -->
    <div
      v-if="definition.outputs.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        OUTPUTS
      </h3>
      <div class="port-list">
        <div
          v-for="output in definition.outputs"
          :key="output.id"
          class="port-item"
        >
          <span
            class="port-dot"
            :style="{ background: getTypeColor(output.type) }"
          />
          <span class="port-name">{{ output.label }}</span>
          <span
            class="port-type"
            :style="{ color: getTypeColor(output.type) }"
          >{{ getTypeName(output.type) }}</span>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div
      v-if="definition.controls.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        CONTROLS
      </h3>
      <div class="port-list">
        <div
          v-for="control in definition.controls"
          :key="control.id"
          class="port-item"
        >
          <span
            class="port-dot"
            style="background: var(--color-neutral-400)"
          />
          <span class="port-name">{{ control.label }}</span>
          <span class="port-type">{{ control.type }}</span>
        </div>
      </div>
    </div>

    <!-- Tips -->
    <div
      v-if="definition.info?.tips && definition.info.tips.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        TIPS
      </h3>
      <ul class="tips-list">
        <li
          v-for="(tip, i) in definition.info.tips"
          :key="i"
        >
          {{ tip }}
        </li>
      </ul>
    </div>

    <!-- Works Well With -->
    <div
      v-if="pairsWithNodes.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        WORKS WELL WITH
      </h3>
      <div class="pairs-list">
        <button
          v-for="node in pairsWithNodes"
          :key="node.id"
          class="pair-chip"
          :style="{ borderColor: categoryMeta[node.category]?.color }"
          @click="emit('navigateTo', node.id)"
        >
          <span
            class="pair-dot"
            :style="{ background: categoryMeta[node.category]?.color }"
          />
          {{ node.name }}
        </button>
      </div>
    </div>

    <!-- Snippets -->
    <div
      v-if="relatedSnippets.length > 0"
      class="detail-section"
    >
      <h3 class="section-title">
        SNIPPETS
      </h3>
      <div class="snippets-list">
        <div
          v-for="snippet in relatedSnippets"
          :key="snippet.id"
          class="snippet-card"
        >
          <div class="snippet-info">
            <span class="snippet-name">{{ snippet.name }}</span>
            <span class="snippet-desc">{{ snippet.description }}</span>
          </div>
          <button
            class="snippet-insert"
            @click="emit('insertSnippet', snippet.id)"
          >
            Insert
          </button>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button
        class="action-btn primary"
        @click="emit('addToFlow', definition.id)"
      >
        Add to Flow
      </button>
    </div>
  </div>
</template>

<style scoped>
.node-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  overflow-y: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: none;
  border: 1px solid var(--color-neutral-200);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-neutral-600);
}

.back-btn:hover {
  background: var(--color-neutral-100);
}

.detail-category {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.detail-name {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-800);
  margin: 0;
}

.detail-overview {
  font-size: 12px;
  color: var(--color-neutral-600);
  line-height: 1.5;
  margin: 0;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-title {
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--color-neutral-500);
  margin: 0;
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-neutral-200);
}

.port-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.port-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-50);
}

.port-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
}

.port-name {
  flex: 1;
  font-size: 11px;
  color: var(--color-neutral-700);
}

.port-type {
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  text-transform: lowercase;
}

.tips-list {
  margin: 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.tips-list li {
  font-size: 11px;
  color: var(--color-neutral-600);
  line-height: 1.4;
}

.pairs-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.pair-chip {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  background: none;
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-neutral-700);
}

.pair-chip:hover {
  background: var(--color-neutral-100);
}

.pair-dot {
  width: 6px;
  height: 6px;
}

.snippets-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.snippet-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-neutral-200);
}

.snippet-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.snippet-name {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.snippet-desc {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.snippet-insert {
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-700);
}

.snippet-insert:hover {
  background: var(--color-neutral-200);
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-neutral-200);
}

.action-btn {
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  border: 2px solid;
}

.action-btn.primary {
  background: var(--color-neutral-800);
  border-color: var(--color-neutral-800);
  color: var(--color-neutral-0);
}

.action-btn.primary:hover {
  background: var(--color-neutral-700);
}
</style>
