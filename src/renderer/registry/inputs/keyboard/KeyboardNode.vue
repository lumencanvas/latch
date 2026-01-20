<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { GripHorizontal } from 'lucide-vue-next'
import { dataTypeMeta } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import PianoKeyboard from '@/components/controls/PianoKeyboard.vue'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()

const hoveredPort = ref<string | null>(null)

// Resize state
const isResizing = ref(false)
const resizeEdge = ref<'right' | 'bottom' | 'corner' | null>(null)
const startSize = ref({ width: 0, height: 0 })
const startPos = ref({ x: 0, y: 0 })

const HEADER_HEIGHT = 20

// Node dimensions (stored in node data for persistence)
const nodeWidth = computed({
  get: () => (props.data?._width as number) ?? 400,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { _width: value })
  },
})

const nodeHeight = computed({
  get: () => (props.data?._height as number) ?? 140,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { _height: value })
  },
})

// Control values (all managed via properties panel)
const numKeys = computed(() => parseInt((props.data?.numKeys as string) ?? '25'))
const startOctave = computed(() => (props.data?.startOctave as number) ?? 3)
const octaveShift = computed(() => (props.data?.octaveShift as number) ?? 0)
const includeBlackKeys = computed(() => (props.data?.includeBlackKeys as boolean) ?? true)
const velocitySensitive = computed(() => (props.data?.velocitySensitive as boolean) ?? true)

// Current note state
const currentNote = computed(() => (props.data?.note as number) ?? 0)

// Keyboard fills the node (minus header and handle space)
const keyboardWidth = computed(() => nodeWidth.value - 18) // 12px handles margin + 6px right frame
const keyboardHeight = computed(() => nodeHeight.value - HEADER_HEIGHT)

// Handle note events
function handleNoteOn(note: number, velocity: number) {
  flowsStore.updateNodeData(props.id, {
    note,
    velocity,
    gate: true,
    noteOn: true,
  })
  setTimeout(() => {
    flowsStore.updateNodeData(props.id, { noteOn: false })
  }, 50)
}

function handleNoteOff(note: number) {
  if (currentNote.value === note) {
    flowsStore.updateNodeData(props.id, { gate: false })
  }
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

// Resize handlers
function onResizeStart(event: MouseEvent, edge: 'right' | 'bottom' | 'corner') {
  event.preventDefault()
  event.stopPropagation()
  isResizing.value = true
  resizeEdge.value = edge
  startSize.value = { width: nodeWidth.value, height: nodeHeight.value }
  startPos.value = { x: event.clientX, y: event.clientY }

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(event: MouseEvent) {
  if (!isResizing.value) return

  const deltaX = event.clientX - startPos.value.x
  const deltaY = event.clientY - startPos.value.y

  if (resizeEdge.value === 'right' || resizeEdge.value === 'corner') {
    nodeWidth.value = Math.max(200, Math.min(1000, startSize.value.width + deltaX))
  }
  if (resizeEdge.value === 'bottom' || resizeEdge.value === 'corner') {
    nodeHeight.value = Math.max(100, Math.min(400, startSize.value.height + deltaY))
  }
}

function onResizeEnd() {
  isResizing.value = false
  resizeEdge.value = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})
</script>

<template>
  <div
    class="keyboard-node"
    :class="{ selected: props.selected, resizing: isResizing }"
    :style="{
      width: nodeWidth + 'px',
      height: nodeHeight + 'px',
    }"
  >
    <!-- Header / Drag handle -->
    <div class="node-header">
      <GripHorizontal
        :size="14"
        class="drag-icon"
      />
      <span class="header-label">KEYBOARD</span>
    </div>

    <!-- Piano Keyboard -->
    <div
      class="keyboard-wrapper"
      @mousedown.stop
    >
      <PianoKeyboard
        :num-keys="numKeys"
        :start-octave="startOctave"
        :octave-shift="octaveShift"
        :include-black-keys="includeBlackKeys"
        :velocity-sensitive="velocitySensitive"
        :width="keyboardWidth"
        :height="keyboardHeight"
        @note-on="handleNoteOn"
        @note-off="handleNoteOff"
      />
    </div>

    <!-- Output handles -->
    <div class="handles-column">
      <div
        v-for="output in [
          { id: 'note', type: 'number', label: 'Note' },
          { id: 'velocity', type: 'number', label: 'Velocity' },
          { id: 'noteOn', type: 'trigger', label: 'Note On' },
          { id: 'gate', type: 'boolean', label: 'Gate' },
        ]"
        :key="output.id"
        class="handle-slot"
        @mouseenter="hoveredPort = output.id"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="output.id"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor(output.type) }"
          class="port-handle"
        />
        <div
          class="port-label"
          :class="{ visible: hoveredPort === output.id || props.selected }"
        >
          <span class="label-text">{{ output.label }}</span>
        </div>
      </div>
    </div>

    <!-- Resize handles -->
    <div
      class="resize-handle resize-right"
      @mousedown="onResizeStart($event, 'right')"
    />
    <div
      class="resize-handle resize-bottom"
      @mousedown="onResizeStart($event, 'bottom')"
    />
    <div
      class="resize-handle resize-corner"
      @mousedown="onResizeStart($event, 'corner')"
    />
  </div>
</template>

<style scoped>
.keyboard-node {
  position: relative;
  min-width: 200px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  background: #4b5563; /* Extends header color across full width including handles area */
}

.keyboard-node.selected {
  outline: 2px solid var(--color-primary-400);
  outline-offset: 2px;
}

.keyboard-node.resizing {
  transition: none;
}

/* Header for dragging */
.node-header {
  height: 20px;
  background: #4b5563;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: grab;
  flex-shrink: 0;
  margin-right: 0; /* Full width including handles */
}

.node-header:active {
  cursor: grabbing;
}

.drag-icon {
  color: #9ca3af;
}

.header-label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.5px;
}

/* Keyboard wrapper */
.keyboard-wrapper {
  flex: 1;
  overflow: hidden;
  margin-right: 12px; /* Space for handles */
  background: #6b7280;
  padding-right: 6px; /* Right edge of frame */
}

/* Handle column */
.handles-column {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  z-index: 10;
}

.handle-slot {
  position: relative;
  height: 16px;
  display: flex;
  align-items: center;
}

/* Port labels */
.port-label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-700);
  background: var(--color-neutral-0);
  padding: 2px 6px;
  border: 1px solid var(--color-neutral-200);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 1000;
}

.port-label.visible {
  opacity: 1;
}

.label-text {
  color: var(--color-neutral-600);
}

/* Resize handles */
.resize-handle {
  position: absolute;
  z-index: 20;
}

.resize-right {
  right: 10px;
  top: 25%;
  width: 4px;
  height: 50%;
  cursor: ew-resize;
}

.resize-bottom {
  bottom: 0;
  left: 10%;
  width: 70%;
  height: 4px;
  cursor: ns-resize;
}

.resize-corner {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.resize-handle:hover,
.keyboard-node.resizing .resize-handle {
  background: var(--color-primary-300);
}

/* Handle styles */
:deep(.port-handle) {
  width: 10px !important;
  height: 10px !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-right) {
  right: -5px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
