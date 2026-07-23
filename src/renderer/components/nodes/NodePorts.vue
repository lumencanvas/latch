<script setup lang="ts">
/**
 * Shared port columns for CUSTOM-component node views (muse-eeg, thermal-printer, neosensory-buzz,
 * ble-characteristic, …). Renders the SAME established port pattern BaseNode uses — a coloured handle
 * on the node edge + a hover/select-revealed pill of `glyph · label · type` — so custom nodes don't
 * drift from the standard look. Parent must be `position: relative`.
 */
import { ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { dataTypeMeta } from '@/stores/nodes'

interface Port { id: string; type: string; label: string }
withDefaults(
  defineProps<{ inputs?: Port[]; outputs?: Port[]; selected?: boolean; headerOffset?: number }>(),
  { inputs: () => [], outputs: () => [], selected: false, headerOffset: 30 }
)

const hovered = ref<string | null>(null)
const meta = (t: string) => dataTypeMeta[t as keyof typeof dataTypeMeta] as { color?: string; glyph?: string; lineStyle?: string } | undefined
const typeColor = (t: string) => meta(t)?.color ?? 'var(--color-neutral-400)'
const typeGlyph = (t: string) => meta(t)?.glyph ?? '*'
const handleStyle = (t: string) => { const c = typeColor(t); return { background: c, '--port-color': c } }
const lineClass = (t: string) => { const ls = meta(t)?.lineStyle; return { 'port-line-dotted': ls === 'dotted', 'port-line-dashed': ls === 'dashed' } }
// Semantic type label — mirrors BaseNode.getSemanticLabel so the "float / cam / pulse …" chips match.
function semantic(portId: string, type: string): string {
  if (portId.includes('norm') || portId.includes('Norm') || portId.startsWith('0-1') || portId.includes('normalized')) return '0→1'
  if (portId.includes('raw') || portId.includes('Raw')) return 'raw'
  if (portId === 'pass' || portId.includes('through') || portId === 'passthrough') return 'pass'
  const labels: Record<string, string> = {
    boolean: 'bool', trigger: 'pulse', any: 'any', number: 'float', string: 'str', texture: 'tex',
    audio: 'audio', data: 'data', scene3d: 'scene', object3d: 'obj3d', geometry3d: 'geo',
    material3d: 'mat', camera3d: 'cam', light3d: 'light', transform3d: 'xfm', video: 'video',
  }
  return labels[type] ?? type
}
</script>

<template>
  <div class="np-ports">
    <div
      class="np-column np-left"
      :style="{ paddingTop: headerOffset + 'px' }"
    >
      <div
        v-for="p in inputs"
        :key="p.id"
        class="np-slot"
        @mouseenter="hovered = 'in-' + p.id"
        @mouseleave="hovered = null"
      >
        <Handle
          :id="p.id"
          type="target"
          :position="Position.Left"
          class="np-handle np-in"
          :class="lineClass(p.type)"
          :style="handleStyle(p.type)"
          :aria-label="`${p.label} input (${semantic(p.id, p.type)})`"
        />
        <div
          class="np-label np-label-left"
          :class="{ visible: hovered === 'in-' + p.id || selected }"
        >
          <span
            class="np-glyph"
            :style="{ color: typeColor(p.type) }"
            aria-hidden="true"
          >{{ typeGlyph(p.type) }}</span>
          <span class="np-text">{{ p.label }}</span>
          <span
            class="np-type"
            :style="{ color: typeColor(p.type) }"
          >{{ semantic(p.id, p.type) }}</span>
        </div>
      </div>
    </div>

    <div
      class="np-column np-right"
      :style="{ paddingTop: headerOffset + 'px' }"
    >
      <div
        v-for="p in outputs"
        :key="p.id"
        class="np-slot"
        @mouseenter="hovered = 'out-' + p.id"
        @mouseleave="hovered = null"
      >
        <Handle
          :id="p.id"
          type="source"
          :position="Position.Right"
          class="np-handle np-out"
          :class="lineClass(p.type)"
          :style="handleStyle(p.type)"
          :aria-label="`${p.label} output (${semantic(p.id, p.type)})`"
        />
        <div
          class="np-label np-label-right"
          :class="{ visible: hovered === 'out-' + p.id || selected }"
        >
          <span
            class="np-glyph"
            :style="{ color: typeColor(p.type) }"
            aria-hidden="true"
          >{{ typeGlyph(p.type) }}</span>
          <span class="np-text">{{ p.label }}</span>
          <span
            class="np-type"
            :style="{ color: typeColor(p.type) }"
          >{{ semantic(p.id, p.type) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.np-ports { position: absolute; inset: 0; pointer-events: none; }
.np-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 10;
}
.np-left { left: 0; }
.np-right { right: 0; }
.np-slot {
  position: relative;
  height: 22px;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.np-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  background: var(--color-neutral-0);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-neutral-200);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 1000;
}
.np-label.visible { opacity: 1; }
.np-label-left { right: 12px; top: 50%; transform: translateY(-50%); }
.np-label-right { left: 12px; top: 50%; transform: translateY(-50%); }
.np-text { color: var(--color-neutral-600); }
.np-type { font-weight: var(--font-weight-bold); text-transform: lowercase; opacity: 0.85; }
.np-glyph { font-family: var(--font-mono); font-weight: var(--font-weight-bold); line-height: 1; }

:deep(.np-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
:deep(.np-handle.np-in) { left: -5px !important; }
:deep(.np-handle.np-out) { right: -5px !important; }
:deep(.np-handle:hover) { box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1); }
:deep(.np-handle.port-line-dotted) {
  background: var(--color-neutral-0) !important;
  border-color: var(--port-color, var(--color-neutral-400)) !important;
  border-style: dotted !important;
}
:deep(.np-handle.port-line-dashed) {
  background: var(--color-neutral-0) !important;
  border-color: var(--port-color, var(--color-neutral-400)) !important;
  border-style: dashed !important;
}
</style>
