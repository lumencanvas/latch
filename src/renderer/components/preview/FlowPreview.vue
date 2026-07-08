<script setup lang="ts">
import { computed } from 'vue'
import { flowToPreview } from '@/utils/flowPreview'

// A small schematic thumbnail of a flow: category-coloured node dots joined by
// edge lines. Purely decorative (the card's text names the flow), so aria-hidden.
// Geometry lives in the tested `flowToPreview` util; this just renders the model.
const props = defineProps<{
  nodes: Array<{ id: string; type: string; position: { x: number; y: number } }>
  edges: Array<{ source: string; target: string }>
  getColor?: (type: string) => string
  width?: number
  height?: number
}>()

const preview = computed(() =>
  flowToPreview(props.nodes, props.edges, {
    width: props.width,
    height: props.height,
    getColor: props.getColor,
  }),
)
</script>

<template>
  <svg
    class="flow-preview"
    :viewBox="`0 0 ${preview.width} ${preview.height}`"
    :width="preview.width"
    :height="preview.height"
    aria-hidden="true"
    focusable="false"
  >
    <line
      v-for="(e, i) in preview.edges"
      :key="`e${i}`"
      :x1="e.x1"
      :y1="e.y1"
      :x2="e.x2"
      :y2="e.y2"
      class="flow-preview-edge"
    />
    <circle
      v-for="(n, i) in preview.nodes"
      :key="`n${i}`"
      :cx="n.x"
      :cy="n.y"
      :r="n.r"
      :fill="n.color"
      class="flow-preview-node"
    />
  </svg>
</template>

<style scoped>
.flow-preview {
  display: block;
  width: 100%;
  height: auto;
}

.flow-preview-edge {
  stroke: var(--color-neutral-300);
  stroke-width: 1.5;
}

.flow-preview-node {
  stroke: var(--color-neutral-0);
  stroke-width: 1.5;
}
</style>
