<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import {
  ChevronDown,
  ChevronRight,
  Bug,
  Download,
  Upload,
  Clock,
  Calculator,
  GitBranch,
  Music,
  Video,
  Tv2,
  Palette,
  Database,
  Cpu,
  Code,
  Box,
  Wifi,
  Layers,
  Puzzle,
  Loader2,
  Type,
  Send,
  Radio,
} from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, type NodeCategory, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import TexturePreview from '@/components/preview/TexturePreview.vue'
import NodeConnectionStatus from '@/components/connections/NodeConnectionStatus.vue'
import { useDeviceEnumeration, type DeviceType, type DeviceOption } from '@/composables/useDeviceEnumeration'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

// Device enumeration for audio/video selects
const { audioInputDevices, audioOutputDevices, videoInputDevices } = useDeviceEnumeration()

const isCollapsed = ref(false)
const hoveredPort = ref<string | null>(null)
const isEditingLabel = ref(false)
const editedLabel = ref('')
const labelInputRef = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)
let loadingCheckInterval: number | null = null

// Check if node has a loading output (AI nodes)
const hasLoadingOutput = computed(() => {
  return definition.value?.outputs.some(o => o.id === 'loading') ?? false
})

// Poll for loading state from execution engine
function checkLoadingState() {
  if (!hasLoadingOutput.value) return
  const engine = getExecutionEngine()
  const loading = engine.getOutputValue(props.id, 'loading')
  isLoading.value = loading === true
}

onMounted(() => {
  if (hasLoadingOutput.value) {
    loadingCheckInterval = window.setInterval(checkLoadingState, 100)
  }
})

onUnmounted(() => {
  if (loadingCheckInterval) {
    clearInterval(loadingCheckInterval)
  }
})

// Get definition from nodesStore using nodeType (more reliable than props.data.definition)
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = props.data?.nodeType as string | undefined
  if (nodeType) {
    const fromStore = nodesStore.getDefinition(nodeType)
    if (fromStore) return fromStore
  }
  return props.data?.definition ?? null
})

const nodeLabel = computed(() => {
  return props.data?.label ?? props.data?.nodeType ?? 'Node'
})

const categoryIcons: Record<NodeCategory, typeof Bug> = {
  debug: Bug,
  inputs: Download,
  outputs: Upload,
  timing: Clock,
  math: Calculator,
  logic: GitBranch,
  audio: Music,
  video: Video,
  visual: Tv2,
  shaders: Palette,
  data: Database,
  ai: Cpu,
  code: Code,
  '3d': Box,
  connectivity: Wifi,
  clasp: Radio,
  subflows: Layers,
  string: Type,
  messaging: Send,
  custom: Puzzle,
}

const categoryIcon = computed(() => {
  if (!definition.value) return Code
  return categoryIcons[definition.value.category] ?? Code
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Merge static definition inputs with dynamic inputs from node data
// Dynamic inputs are stored in node.data._dynamicInputs (used by shader nodes)
const inputs = computed(() => {
  const staticInputs = definition.value?.inputs ?? []
  const dynamicInputs = (props.data?._dynamicInputs as Array<{ id: string; type: string; label: string }>) ?? []

  // Merge: static first, then dynamic (avoiding duplicates)
  const staticIds = new Set(staticInputs.map(i => i.id))
  const mergedDynamic = dynamicInputs.filter(d => !staticIds.has(d.id))

  return [...staticInputs, ...mergedDynamic]
})

// Merge static definition outputs with dynamic outputs from node data
// Dynamic outputs are stored in node.data._dynamicOutputs (used by dispatch node)
const outputs = computed(() => {
  const staticOutputs = definition.value?.outputs ?? []
  const dynamicOutputs = (props.data?._dynamicOutputs as Array<{ id: string; type: string; label: string }>) ?? []

  // Merge: static first, then dynamic (avoiding duplicates)
  const staticIds = new Set(staticOutputs.map(o => o.id))
  const mergedDynamic = dynamicOutputs.filter(d => !staticIds.has(d.id))

  return [...staticOutputs, ...mergedDynamic]
})

// Merge static definition controls with dynamic controls from node data
// Dynamic controls are stored in node.data._dynamicControls (used by shader nodes)
const controls = computed(() => {
  const staticControls = definition.value?.controls ?? []
  const dynamicControls = (props.data?._dynamicControls as Array<{
    id: string
    type: string
    label: string
    default: unknown
    props?: Record<string, unknown>
    visibleWhen?: { controlId: string; value: unknown }
  }>) ?? []

  // Merge: static first, then dynamic (avoiding duplicates)
  const staticIds = new Set(staticControls.map(c => c.id))
  const mergedDynamic = dynamicControls.filter(d => !staticIds.has(d.id))

  return [...staticControls, ...mergedDynamic]
})

// Compute connection bindings from controls of type 'connection' or 'connection-select'
// These bindings drive the NodeConnectionStatus component
const connectionBindings = computed(() => {
  const bindings: Array<{
    connectionId: string
    controlId: string
    required?: boolean
  }> = []

  // Look for controls that reference connections
  for (const control of controls.value) {
    if (control.type === 'connection' || control.type === 'connection-select') {
      const connectionId = props.data?.[control.id] as string | undefined
      if (connectionId) {
        bindings.push({
          connectionId,
          controlId: control.id,
          required: (control.props as Record<string, unknown>)?.required as boolean | undefined,
        })
      }
    }
  }

  // Also check for connections defined in the node definition
  const nodeConnections = definition.value?.connections ?? []
  for (const conn of nodeConnections) {
    const connectionId = props.data?.[conn.controlId] as string | undefined
    if (connectionId && !bindings.some(b => b.controlId === conn.controlId)) {
      bindings.push({
        connectionId,
        controlId: conn.controlId,
        required: conn.required,
      })
    }
  }

  return bindings
})

// Check if this is a visual node with texture output
const hasTextureOutput = computed(() => {
  if (!definition.value) return false
  return definition.value.outputs.some(o => o.type === 'texture')
})

// Check if this node has inline controls
const hasInlineControls = computed(() => {
  if (!definition.value) return false
  return controls.value.some(c =>
    c.type === 'slider' ||
    c.type === 'toggle' ||
    c.type === 'select' ||
    c.type === 'number' ||
    c.type === 'text' ||
    c.type === 'color'
  )
})

// Filter controls to show inline (not code type, respects visibleWhen)
const inlineControls = computed(() => {
  return controls.value.filter(c => {
    if (c.type === 'code') return false
    if (c.visibleWhen) {
      const otherValue = controlValues.value[c.visibleWhen.controlId]
      if (otherValue !== c.visibleWhen.value) return false
    }
    return true
  })
})

// Check if this is a simple node (no content to show in body)
const isSimpleNode = computed(() => {
  return !hasTextureOutput.value && !hasInlineControls.value
})

// Node types that should always show inline controls (control-type nodes)
const controlNodeTypes = ['slider', 'trigger', 'xy-pad', 'constant', 'lfo', 'monitor', 'oscilloscope']

// Categories where nodes should use compact display (icon only, controls in properties panel)
const compactCategories = ['math', 'logic', '3d', 'audio']

// Check if this node should use compact display (icon-focused, no inline controls)
const isCompactNode = computed(() => {
  if (!definition.value) return false
  const nodeType = props.data?.nodeType as string

  // Control nodes should never be compact
  if (controlNodeTypes.includes(nodeType)) return false

  // Nodes with texture output need preview, not compact
  if (hasTextureOutput.value) return false

  // If no controls, use simple node style instead
  if (!hasInlineControls.value) return false

  // Use compact style for these categories
  return compactCategories.includes(definition.value.category)
})


// Local control values
const controlValues = computed(() => {
  const values: Record<string, unknown> = {}
  for (const control of controls.value) {
    values[control.id] = props.data?.[control.id] ?? control.default
  }
  return values
})

// Get options for a select control, supporting dynamic device enumeration
function getSelectOptions(control: { props?: Record<string, unknown> }): DeviceOption[] | string[] {
  const deviceType = control.props?.deviceType as DeviceType | undefined

  if (deviceType) {
    // Dynamic device enumeration based on deviceType
    switch (deviceType) {
      case 'audio-input':
        return audioInputDevices.value
      case 'audio-output':
        return audioOutputDevices.value
      case 'video-input':
        return videoInputDevices.value
    }
  }

  // Static options from control definition
  return (control.props?.options as string[] | DeviceOption[]) ?? []
}

// Check if options are device options (objects with value/label)
function isDeviceOptions(options: DeviceOption[] | string[]): options is DeviceOption[] {
  return options.length > 0 && typeof options[0] === 'object' && 'value' in options[0]
}

// Calculate handle positions - evenly distributed along the node height
const maxPorts = computed(() => Math.max(inputs.value.length, outputs.value.length, 1))
const portSpacing = 20 // pixels between ports

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

function getSemanticLabel(portId: string, type: string): string {
  if (portId.includes('norm') || portId.includes('Norm') || portId.startsWith('0-1') || portId.includes('normalized')) {
    return '0→1'
  }
  if (portId.includes('raw') || portId.includes('Raw')) {
    return 'raw'
  }
  if (portId === 'pass' || portId.includes('through') || portId === 'passthrough') {
    return 'pass'
  }

  const typeLabels: Record<string, string> = {
    boolean: 'bool',
    trigger: 'pulse',
    any: 'any',
    number: 'float',
    string: 'str',
    texture: 'tex',
    audio: 'audio',
    data: 'data',
    scene3d: 'scene',
    object3d: 'obj3d',
    geometry3d: 'geo',
    material3d: 'mat',
    camera3d: 'cam',
    light3d: 'light',
    transform3d: 'xfm',
    video: 'video',
  }

  return typeLabels[type] ?? type
}


function updateControl(controlId: string, value: unknown) {
  flowsStore.updateNodeData(props.id, {
    [controlId]: value,
  })
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function startEditingLabel() {
  editedLabel.value = nodeLabel.value
  isEditingLabel.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
    labelInputRef.value?.select()
  })
}

function saveLabel() {
  if (isEditingLabel.value) {
    const trimmed = editedLabel.value.trim()
    if (trimmed && trimmed !== nodeLabel.value) {
      flowsStore.updateNodeData(props.id, { label: trimmed })
    }
    isEditingLabel.value = false
  }
}

function cancelEditLabel() {
  isEditingLabel.value = false
  editedLabel.value = ''
}

function onLabelKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveLabel()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditLabel()
  }
}
</script>

<template>
  <div
    class="base-node"
    :class="{
      selected: props.selected,
      collapsed: isCollapsed,
      'simple-node': isSimpleNode && !isCollapsed,
      'compact-node': isCompactNode && !isCollapsed,
      'has-preview': hasTextureOutput,
    }"
    :style="{
      '--port-count': maxPorts,
      '--port-spacing': portSpacing + 'px',
    }"
  >
    <!-- Input Handles - absolutely positioned on left edge -->
    <div class="handles-column handles-left">
      <div
        v-for="input in inputs"
        :key="input.id"
        class="handle-slot"
        @mouseenter="hoveredPort = `in-${input.id}`"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="input.id"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor(input.type) }"
          class="port-handle"
        />
        <!-- External label - positioned to the left of the node -->
        <div
          class="port-label port-label-left"
          :class="{ visible: hoveredPort === `in-${input.id}` || props.selected }"
        >
          <span class="label-text">{{ input.label }}</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor(input.type) }"
          >{{ getSemanticLabel(input.id, input.type) }}</span>
        </div>
      </div>
    </div>

    <!-- Output Handles - absolutely positioned on right edge -->
    <div class="handles-column handles-right">
      <div
        v-for="output in outputs"
        :key="output.id"
        class="handle-slot"
        @mouseenter="hoveredPort = `out-${output.id}`"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="output.id"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor(output.type) }"
          class="port-handle"
        />
        <!-- External label - positioned to the right of the node -->
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === `out-${output.id}` || props.selected }"
        >
          <span class="label-text">{{ output.label }}</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor(output.type) }"
          >{{ getSemanticLabel(output.id, output.type) }}</span>
        </div>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <component
          :is="categoryIcon"
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <input
          v-if="isEditingLabel"
          ref="labelInputRef"
          v-model="editedLabel"
          type="text"
          class="node-title-input"
          @blur="saveLabel"
          @keydown="onLabelKeydown"
          @mousedown.stop
          @click.stop
        >
        <span
          v-else
          class="node-title"
          title="Double-click to edit label"
          @dblclick.stop.prevent="startEditingLabel"
        >{{ nodeLabel }}</span>
        <Loader2
          v-if="isLoading"
          :size="12"
          class="loading-indicator"
        />
        <button
          v-if="!isSimpleNode"
          class="node-collapse-btn"
          @click.stop="toggleCollapse"
        >
          <ChevronDown
            v-if="!isCollapsed"
            :size="14"
          />
          <ChevronRight
            v-else
            :size="14"
          />
        </button>
      </div>

      <!-- Connection Status (like Node-RED's colored dots) -->
      <NodeConnectionStatus
        v-if="connectionBindings.length > 0 && !isCollapsed"
        :bindings="connectionBindings"
      />

      <!-- Compact Body - just icon with category color -->
      <div
        v-if="isCompactNode && !isCollapsed"
        class="compact-body"
        :style="{ background: categoryColor }"
      >
        <component
          :is="categoryIcon"
          :size="32"
          class="compact-icon"
        />
      </div>

      <!-- Body - only shown for non-simple, non-compact nodes when not collapsed -->
      <div
        v-else-if="!isSimpleNode && !isCollapsed"
        class="node-body"
      >
        <!-- Texture Preview -->
        <div
          v-if="hasTextureOutput"
          class="node-preview"
        >
          <TexturePreview
            :node-id="props.id"
            :width="120"
            :height="80"
            :show-placeholder="true"
          />
        </div>

        <!-- Inline Controls -->
        <div
          v-if="hasInlineControls && inlineControls.length > 0"
          class="node-controls"
        >
          <div
            v-for="control in inlineControls"
            :key="control.id"
            class="inline-control"
          >
            <label class="control-label">{{ control.label }}</label>

            <!-- Slider -->
            <div
              v-if="control.type === 'slider'"
              class="control-slider"
            >
              <input
                type="range"
                :value="(controlValues[control.id] as number) ?? 0"
                :min="(control.props?.min as number) ?? 0"
                :max="(control.props?.max as number) ?? 1"
                :step="(control.props?.step as number) ?? 0.01"
                @input="updateControl(control.id, parseFloat(($event.target as HTMLInputElement).value))"
                @mousedown.stop
              >
              <span class="slider-value">{{ ((controlValues[control.id] as number) ?? 0).toFixed(2) }}</span>
            </div>

            <!-- Toggle -->
            <label
              v-else-if="control.type === 'toggle'"
              class="control-toggle"
              @mousedown.stop
            >
              <input
                type="checkbox"
                :checked="controlValues[control.id] as boolean"
                @change="updateControl(control.id, ($event.target as HTMLInputElement).checked)"
              >
              <span class="toggle-track">
                <span class="toggle-thumb" />
              </span>
              <span class="toggle-label">{{ controlValues[control.id] ? 'ON' : 'OFF' }}</span>
            </label>

            <!-- Select -->
            <select
              v-else-if="control.type === 'select'"
              class="control-select"
              :value="controlValues[control.id]"
              @change="updateControl(control.id, ($event.target as HTMLSelectElement).value)"
              @mousedown.stop
            >
              <template v-if="isDeviceOptions(getSelectOptions(control))">
                <option
                  v-for="option in getSelectOptions(control) as DeviceOption[]"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </template>
              <template v-else>
                <option
                  v-for="option in getSelectOptions(control) as string[]"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </template>
            </select>

            <!-- Number -->
            <input
              v-else-if="control.type === 'number'"
              type="number"
              class="control-number"
              :value="(controlValues[control.id] as number) ?? 0"
              :step="(control.props?.step as number) ?? 1"
              @input="updateControl(control.id, parseFloat(($event.target as HTMLInputElement).value) || 0)"
              @mousedown.stop
            >

            <!-- Text -->
            <input
              v-else-if="control.type === 'text'"
              type="text"
              class="control-text"
              :value="(controlValues[control.id] as string) ?? ''"
              :placeholder="(control.props?.placeholder as string) ?? ''"
              @input="updateControl(control.id, ($event.target as HTMLInputElement).value)"
              @mousedown.stop
            >

            <!-- Color -->
            <div
              v-else-if="control.type === 'color'"
              class="control-color"
              @mousedown.stop
            >
              <input
                type="color"
                :value="(controlValues[control.id] as string) ?? '#808080'"
                @input="updateControl(control.id, ($event.target as HTMLInputElement).value)"
              >
              <span class="color-value">{{ controlValues[control.id] }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.base-node {
  position: relative;
  min-width: 100px;
  font-family: var(--font-mono);
  /* Dynamic min-height based on port count */
  min-height: calc(32px + (var(--port-count, 1) * var(--port-spacing, 20px)));
  display: flex;
  flex-direction: column;
}

.base-node.has-preview {
  min-width: 160px;
}

/* Node content - the visible box - must fill base-node for handle alignment */
.node-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.base-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.base-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Simple node - compact style */
.base-node.simple-node .node-content {
  min-height: calc(32px + (var(--port-count, 1) - 1) * var(--port-spacing, 20px));
}

/* Compact node - icon-focused style for math/logic/3d nodes */
.base-node.compact-node {
  min-width: 80px;
}

.base-node.compact-node .node-content {
  /* Height based on port count like other nodes */
  min-height: calc(32px + var(--port-count, 1) * var(--port-spacing, 20px));
  display: flex;
  flex-direction: column;
}

.base-node.compact-node .node-header {
  flex-shrink: 0;
}

.compact-body {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  min-height: 40px;
  margin: 0;
}

.compact-icon {
  color: white;
  opacity: 0.95;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
}

/* Header */
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-left: 3px solid var(--color-neutral-400);
}

.base-node:not(.simple-node) .node-header {
  border-bottom: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default) var(--radius-default) 0 0;
}

.base-node.simple-node .node-header {
  border-radius: var(--radius-default);
  flex: 1;
  align-items: center;
}

.node-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.node-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
  cursor: text;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 2px;
  transition: background var(--transition-fast);
}

.node-title:hover {
  background: var(--color-neutral-100);
}

.node-title-input {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-primary-400);
  border-radius: 2px;
  padding: 1px 4px;
  outline: none;
  min-width: 60px;
}

.loading-indicator {
  color: var(--color-primary-500);
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.node-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.node-collapse-btn:hover {
  color: var(--color-neutral-600);
}

/* Body */
.node-body {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Preview */
.node-preview {
  margin: 0 auto;
  border-radius: 2px;
  overflow: hidden;
}

/* Controls */
.node-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.inline-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-label {
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 40px;
}

.control-slider {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-slider input[type="range"] {
  flex: 1;
  height: 3px;
  -webkit-appearance: none;
  background: var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
}

.control-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--color-primary-400);
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  min-width: 32px;
  font-size: 9px;
  color: var(--color-neutral-600);
  text-align: right;
}

.control-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}

.control-toggle input {
  display: none;
}

.toggle-track {
  position: relative;
  width: 24px;
  height: 12px;
  background: var(--color-neutral-200);
  border-radius: 6px;
  transition: background var(--transition-fast);
}

.control-toggle input:checked + .toggle-track {
  background: var(--color-primary-400);
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.control-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(12px);
}

.toggle-label {
  font-size: 9px;
  color: var(--color-neutral-500);
  font-weight: var(--font-weight-medium);
}

.control-select {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
  cursor: pointer;
}

.control-select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-number {
  width: 60px;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-number:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-text {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.control-text:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-color {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.control-color input[type="color"] {
  width: 24px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
  -webkit-appearance: none;
}

.control-color input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 1px;
}

.control-color input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 1px;
}

.color-value {
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

/* Handle columns - positioned at node edges */
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  z-index: 10;
  /* Start handles at header center height */
  padding-top: 16px;
}

/* For simple nodes, center handles vertically */
.base-node.simple-node .handles-column {
  justify-content: center;
  padding-top: 0;
}

/* For collapsed nodes - show only header */
.base-node.collapsed .node-content {
  min-height: auto;
}

.base-node.collapsed .node-header {
  border-radius: var(--radius-default);
  border-bottom: none;
}

/* For collapsed nodes, stack all handles at the same position */
.base-node.collapsed .handles-column {
  justify-content: center;
  padding-top: 0;
  gap: 0;
}

.base-node.collapsed .handle-slot {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: auto;
}

/* Hide port labels when collapsed */
.base-node.collapsed .port-label {
  display: none;
}

.handles-left {
  left: 0;
}

.handles-right {
  right: 0;
}

/* Handle slot */
.handle-slot {
  position: relative;
  height: var(--port-spacing, 20px);
  display: flex;
  align-items: center;
}

/* Port labels - positioned OUTSIDE the node */
.port-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
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

.port-label.visible {
  opacity: 1;
}

.port-label-left {
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.port-label-right {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.label-text {
  color: var(--color-neutral-600);
}

.label-type {
  font-weight: var(--font-weight-bold);
  text-transform: lowercase;
  opacity: 0.85;
}

/* Handle styles */
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-left) {
  left: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle-right) {
  right: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
