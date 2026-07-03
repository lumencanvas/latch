<script setup lang="ts">
/**
 * XYPad — a reusable 2-axis pad control (Phase 3 bullet 2, Tier B). One draggable point over a square
 * area, bound to a normalized `{ x, y }` (both 0..1, y up). Presentational: it emits `update:modelValue`
 * and owns no node state — the host (NodeView's `xy` aggregate, which fans x/y out to two flat controls)
 * keeps the write/undo path. Extracted from the bespoke `xy-pad` node's pad so a future migration to
 * `ui` keeps the same look. Range mapping (min/max) stays outside this widget, as separate controls.
 */
import { ref, computed, onUnmounted } from 'vue'

export interface XYValue {
  x: number // 0..1
  y: number // 0..1 (up)
}

const props = withDefaults(defineProps<{
  modelValue: XYValue
  width?: number
  height?: number
  accentColor?: string
}>(), {
  width: 150,
  height: 120,
  accentColor: '#EC4899',
})

const emit = defineEmits<{
  'update:modelValue': [value: XYValue]
}>()

const padRef = ref<HTMLDivElement | null>(null)

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

// Point position as CSS percentages — y is inverted so 1 sits at the top edge.
const pointStyle = computed(() => ({
  left: `${clamp01(props.modelValue.x) * 100}%`,
  top: `${(1 - clamp01(props.modelValue.y)) * 100}%`,
}))

function updateFromEvent(event: MouseEvent): void {
  if (!padRef.value) return
  const rect = padRef.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const x = (event.clientX - rect.left) / rect.width
  const y = 1 - (event.clientY - rect.top) / rect.height
  emit('update:modelValue', { x: clamp01(x), y: clamp01(y) })
}

// The move/up listeners exist ONLY for the duration of a drag — attached on mousedown, removed on
// mouseup — so `onMouseMove` needs no is-dragging guard (that flag would be a redundant second stop
// mechanism, hiding a teardown regression behind belt-and-suspenders).
function onMouseMove(event: MouseEvent): void {
  updateFromEvent(event)
}

function onMouseUp(): void {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function onMouseDown(event: MouseEvent): void {
  updateFromEvent(event)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div
    ref="padRef"
    class="xy-pad"
    :style="{ width: `${width}px`, height: `${height}px` }"
    @mousedown.stop="onMouseDown"
  >
    <div class="xy-grid">
      <div class="xy-line-h" />
      <div class="xy-line-v" />
    </div>
    <div
      class="xy-point"
      :style="{ ...pointStyle, background: accentColor }"
    />
  </div>
</template>

<style scoped>
.xy-pad {
  position: relative;
  background: linear-gradient(135deg, #e9e4f0 0%, #d3cce3 100%);
  border-radius: var(--radius-xs);
  cursor: crosshair;
  user-select: none;
}

.xy-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.xy-line-h {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(236, 72, 153, 0.3);
}

.xy-line-v {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(236, 72, 153, 0.3);
}

.xy-point {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
</style>
