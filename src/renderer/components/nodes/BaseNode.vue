<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, type Component } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, type WhenSchema, useNodesStore } from '@/stores/nodes'
import { evaluateWhen } from '@/composables/useControlHelpers'
import { categoryIcons, fallbackCategoryIcon } from '@/utils/categoryIcons'
import { resolveNodeRequirement } from '@/utils/platform'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import TexturePreview from '@/components/preview/TexturePreview.vue'
import ColorRampPreview from '@/components/preview/ColorRampPreview.vue'
import EasingPreview from '@/components/preview/EasingPreview.vue'
import EuclideanPreview from '@/components/preview/EuclideanPreview.vue'
import NoisePreview from '@/components/preview/NoisePreview.vue'
import SpringPreview from '@/components/preview/SpringPreview.vue'

/**
 * Node types that render a small live preview of their output in the node body
 * (gradient swatch, easing curve, rhythm pattern, …). Treated like a texture
 * output: forces the node non-compact so the body (and preview) render. These
 * are plain BaseNode nodes — no custom component / components.ts entry needed.
 */
const NODE_PREVIEWS: Record<string, Component> = {
  'color-ramp': ColorRampPreview,
  easing: EasingPreview,
  euclidean: EuclideanPreview,
  noise: NoisePreview,
  spring: SpringPreview,
}
import NodeConnectionStatus from '@/components/connections/NodeConnectionStatus.vue'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'
import NodeView from '@/components/controls/NodeView.vue'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()
const { recordParamEdit } = useFlowHistory()

// The node's current runtime error (cleared when it next executes successfully).
// Drives the red border + header badge. `getNodeMetrics` is reactive via the
// store's nodeMetricsVersion counter.
const nodeError = computed<string | null>(
  () => runtimeStore.getNodeMetrics(props.id)?.lastError ?? null,
)

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

const categoryIcon = computed(() => {
  if (!definition.value) return fallbackCategoryIcon
  return categoryIcons[definition.value.category] ?? fallbackCategoryIcon
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
    when?: WhenSchema
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

// Platform capability warnings: a node may declare abstract `requires` (e.g.
// 'serial', 'webgpu'). Resolve each against the current platform honoring the
// native-or-web duality, so we only warn when NO path works here (no false
// "unavailable" on Electron, where serial/MIDI/BLE run natively).
const capabilityWarnings = computed(() => {
  const requirements = definition.value?.requires ?? []
  return requirements
    .map(req => resolveNodeRequirement(req))
    .filter(status => !status.available)
})

// Check if this is a visual node with texture output
const hasTextureOutput = computed(() => {
  if (!definition.value) return false
  return definition.value.outputs.some(o => o.type === 'texture')
})

// Per-node-type body preview component (gradient/curve/pattern), if any.
const nodePreview = computed<Component | null>(() => {
  const nodeType = props.data?.nodeType as string | undefined
  return (nodeType && NODE_PREVIEWS[nodeType]) || null
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

// Filter controls to show inline (not code type, respects the unified `when` — or the legacy
// `visibleWhen`, mapped onto it. Canvas honors visibleWhen; other legacy schemas map at their
// own call sites so cross-consumer behavior is unchanged).
const inlineControls = computed(() => {
  return controls.value.filter(c => {
    if (c.type === 'code') return false
    const when = c.when ?? (c.visibleWhen ? { [c.visibleWhen.controlId]: c.visibleWhen.value } : undefined)
    return evaluateWhen(when, controlValues.value)
  })
})

// A node with a declarative `ui` schema renders <NodeView> in its body (Phase 3 bullet 2).
const hasUi = computed(() => !!definition.value?.ui)

// Check if this is a simple node (no content to show in body)
const isSimpleNode = computed(() => {
  return !hasTextureOutput.value && !hasInlineControls.value && !nodePreview.value && !hasUi.value
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

  // A node with a declarative `ui` schema must render its NodeView body (e.g. the migrated
  // audio editor nodes envelope-visual/parametric-eq/wavetable), not be compacted to an icon.
  if (hasUi.value) return false

  // Nodes with texture output or a body preview need the body, not compact
  if (hasTextureOutput.value) return false
  if (nodePreview.value) return false

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
  recordParamEdit(props.id, `Change ${nodeLabel.value}`, () => {
    flowsStore.updateNodeData(props.id, {
      [controlId]: value,
    })
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
      'has-preview': hasTextureOutput || !!nodePreview,
      'has-error': !!nodeError,
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
        <AlertTriangle
          v-if="nodeError"
          :size="12"
          class="error-indicator"
          role="img"
          aria-label="Node error"
          :title="nodeError"
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

      <!-- Platform capability warning — this node needs hardware/runtime not
           available on the current platform; explain what to do instead. -->
      <div
        v-if="capabilityWarnings.length > 0 && !isCollapsed"
        class="node-capability-warning"
        role="status"
      >
        <div
          v-for="(warning, i) in capabilityWarnings"
          :key="i"
          class="capability-warning-row"
          :title="warning.suggestion"
        >
          <AlertTriangle
            :size="13"
            aria-hidden="true"
          />
          <span class="capability-warning-text">
            {{ warning.reason }} {{ warning.suggestion }}
          </span>
        </div>
      </div>

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

        <!-- Per-node-type body preview (gradient / curve / rhythm / …) -->
        <div
          v-if="nodePreview"
          class="node-preview node-type-preview"
          @mousedown.stop
        >
          <component
            :is="nodePreview"
            :data="props.data"
          />
        </div>

        <!-- Declarative `ui` schema → one NodeView interpreter -->
        <div
          v-if="hasUi && definition"
          class="node-controls"
        >
          <NodeView
            :node-id="props.id"
            :definition="definition"
            :values="controlValues"
            surface="node"
            @update="updateControl"
          />
        </div>

        <!-- Inline Controls (fallback auto-layout when there's no `ui`) -->
        <div
          v-else-if="hasInlineControls && inlineControls.length > 0"
          class="node-controls"
        >
          <div
            v-for="control in inlineControls"
            :key="control.id"
            class="inline-control"
          >
            <label class="control-label">{{ control.label }}</label>

            <ControlRenderer
              :control="control"
              :model-value="controlValues[control.id]"
              context="canvas"
              @update="(v) => updateControl(control.id, v)"
            />
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

/* Per-node error state: the node's last execution failed. */
.base-node.has-error .node-content {
  border-color: var(--color-error);
}

.base-node.has-error.selected .node-content {
  box-shadow: 4px 4px 0 0 var(--color-error);
}

.error-indicator {
  color: var(--color-error);
  flex-shrink: 0;
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

/* Per-node-type previews (gradient/curve/rhythm) fill the body width. */
.node-type-preview {
  width: 100%;
  margin-bottom: var(--space-2);
}

/* Controls */
.node-capability-warning {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  margin: 0 var(--space-2) var(--space-2);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-sm);
}

.capability-warning-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  color: var(--color-warning);
}

.capability-warning-row svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.capability-warning-text {
  font-size: 11px;
  line-height: 1.35;
  color: var(--color-neutral-700);
}

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
