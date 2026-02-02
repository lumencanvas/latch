<script setup lang="ts">
import { computed } from 'vue'
import { categoryMeta, dataTypeMeta, type NodeDefinition } from '@/stores/nodes'

const props = defineProps<{
  definition: NodeDefinition
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const color = computed(() => categoryMeta[props.definition.category]?.color ?? '#6B7280')
const inputCount = computed(() => props.definition.inputs.length)
const outputCount = computed(() => props.definition.outputs.length)
const controlCount = computed(() => props.definition.controls.length)
</script>

<template>
  <button
    class="node-card"
    @click="emit('select', definition.id)"
  >
    <div class="card-header">
      <span
        class="card-dot"
        :style="{ background: color }"
      />
      <span class="card-name">{{ definition.name }}</span>
    </div>
    <p class="card-desc">{{ definition.description }}</p>
    <div class="card-meta">
      <span
        v-if="inputCount > 0"
        class="meta-badge"
      >{{ inputCount }} in</span>
      <span
        v-if="outputCount > 0"
        class="meta-badge"
      >{{ outputCount }} out</span>
      <span
        v-if="controlCount > 0"
        class="meta-badge"
      >{{ controlCount }} ctrl</span>
    </div>
  </button>
</template>

<style scoped>
.node-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-200);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  transition: border-color 0.1s, box-shadow 0.1s;
}

.node-card:hover {
  border-color: var(--color-neutral-400);
  box-shadow: 3px 3px 0 0 var(--color-neutral-200);
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.card-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
}

.card-desc {
  font-size: 11px;
  color: var(--color-neutral-500);
  line-height: 1.3;
  margin: 0;
}

.card-meta {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.meta-badge {
  font-size: 9px;
  padding: 1px 4px;
  background: var(--color-neutral-100);
  color: var(--color-neutral-600);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
}
</style>
