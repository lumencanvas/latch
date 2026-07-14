<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { X, Code, ChevronRight, Crosshair, Check, Trash2, Pencil, Settings, Bug, Info } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, categoryMeta, type NodeDefinition, type WhenSchema } from '@/stores/nodes'
import { useConnectionsStore } from '@/stores/connections'
import { useRuntimeStore } from '@/stores/runtime'
import TexturePreview from '@/components/preview/TexturePreview.vue'
import ConnectionSelect from '@/components/connections/ConnectionSelect.vue'
import TemplateSelect from '@/components/connections/TemplateSelect.vue'
import HttpTemplateEditor from '@/components/connections/HttpTemplateEditor.vue'
import AssetPickerControl from '@/components/controls/AssetPickerControl.vue'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'
import NodeView from '@/components/controls/NodeView.vue'
import type { HttpConnectionConfig, HttpEndpointTemplate } from '@/services/connections/types'
import DebugPanel from '@/components/debug/DebugPanel.vue'
import { evaluateWhen } from '@/composables/useControlHelpers'
import { useFlowHistory } from '@/composables/useFlowHistory'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()
const { recordParamEdit } = useFlowHistory()

// Panel tab state
type PanelTab = 'properties' | 'info' | 'debug'
const activeTab = ref<PanelTab>('properties')

// Switch to properties when a node is inspected — but on a user's FIRST-EVER inspection,
// land on the Info tab so the per-node teaching content (overview/tips/pairsWith) is
// discovered at least once; afterwards default to Properties as before.
const INFO_TAB_SEEN_KEY = 'latch_info_tab_seen'
watch(() => uiStore.inspectedNode, (nodeId) => {
  if (nodeId) {
    // Show Info ONLY when we successfully record the "seen" flag — so if setItem throws
    // (e.g. Safari private mode) we default to Properties rather than re-forcing Info on
    // every click (the flag would never persist).
    let showInfo = false
    try {
      if (!localStorage.getItem(INFO_TAB_SEEN_KEY)) {
        localStorage.setItem(INFO_TAB_SEEN_KEY, 'true')
        showInfo = true
      }
    } catch { showInfo = false }
    activeTab.value = showInfo ? 'info' : 'properties'
  }
  if (!nodeId && searchSetByInfoTab.value) {
    nodesStore.setSearchQuery('')
    searchSetByInfoTab.value = false
  }
})

// Primitive control types the shared <ControlRenderer> owns (panel context). Non-primitive
// types (connection/template-select/asset-picker/code) keep their bespoke panel delegates.
const RENDERER_TYPES = new Set(['number', 'slider', 'toggle', 'select', 'text', 'color'])
function usesRenderer(type: string): boolean {
  return RENDERER_TYPES.has(type)
}

// Get the inspected node
const inspectedNode = computed(() => {
  if (!uiStore.inspectedNode || !flowsStore.activeFlow) return null
  return flowsStore.activeFlow.nodes.find(n => n.id === uiStore.inspectedNode) ?? null
})

// Get node definition
const nodeDefinition = computed<NodeDefinition | null>(() => {
  if (!inspectedNode.value) return null
  const nodeType = inspectedNode.value.data?.nodeType as string
  return nodesStore.getDefinition(nodeType) ?? null
})

// Get category metadata
const categoryInfo = computed(() => {
  if (!nodeDefinition.value) return null
  return categoryMeta[nodeDefinition.value.category]
})

// Get node output values from runtime
const outputValues = computed(() => {
  if (!inspectedNode.value) return {}
  const metrics = runtimeStore.nodeMetrics.get(inspectedNode.value.id)
  return metrics?.outputValues ?? {}
})

// Check if this is a visual node with texture output
const hasTextureOutput = computed(() => {
  if (!nodeDefinition.value) return false
  return nodeDefinition.value.outputs.some(o => o.type === 'texture')
})

// Check if this is a shader node
const isShaderNode = computed(() => {
  return nodeDefinition.value?.id === 'shader'
})

// Check if this is a function node
const isFunctionNode = computed(() => {
  return nodeDefinition.value?.id === 'function'
})

// Local control values (for editing)
const controlValues = ref<Record<string, unknown>>({})

// Function to sync control values from node data
function syncControlValues() {
  const node = inspectedNode.value
  if (node?.data) {
    const definition = nodeDefinition.value
    if (definition) {
      const values: Record<string, unknown> = {}
      for (const control of definition.controls) {
        values[control.id] = node.data[control.id] ?? control.default
      }
      controlValues.value = values
    }
  } else {
    controlValues.value = {}
  }
}

// Sync control values when node changes
watch(inspectedNode, syncControlValues, { immediate: true })

// Also watch for changes to the inspected node's data (deep watch on specific node)
watch(
  () => inspectedNode.value?.data,
  () => syncControlValues(),
  { deep: true }
)

// Update a control value
function updateControl(controlId: string, value: unknown) {
  controlValues.value[controlId] = value

  // Update node data in flow store, recorded (debounced) for undo.
  const node = inspectedNode.value
  if (node) {
    recordParamEdit(node.id, `Change ${node.data?.label ?? node.data?.nodeType ?? 'node'}`, () => {
      flowsStore.updateNodeData(node.id, {
        [controlId]: value,
      })
    })
  }
}

// Open shader editor
function openShaderEditor() {
  if (inspectedNode.value) {
    uiStore.openShaderEditor(inspectedNode.value.id)
  }
}

// Open code editor
function openCodeEditor() {
  if (inspectedNode.value) {
    uiStore.openCodeEditor(inspectedNode.value.id)
  }
}

// Toggle control exposure to Control Panel
function toggleControlExposure(controlId: string, controlLabel: string) {
  if (!inspectedNode.value) return
  const nodeId = inspectedNode.value.id
  const existing = uiStore.exposedControls.find(c => c.nodeId === nodeId && c.controlId === controlId)
  if (existing) {
    uiStore.unexposeControl(nodeId, controlId)
  } else {
    uiStore.exposeControl(nodeId, controlId, controlLabel)
  }
}

// Delete the inspected node
function deleteNode() {
  if (!inspectedNode.value) return

  const nodeId = inspectedNode.value.id

  // Remove from flow
  flowsStore.removeNode(nodeId)

  // Clean up exposed controls
  const remainingNodeIds = flowsStore.activeNodes.map(n => n.id)
  uiStore.cleanupExposedControls(remainingNodeIds)

  // Clear selection and inspection
  uiStore.clearSelection()
  uiStore.setInspectedNode(null)
}

// Check if a control is exposed
function isExposed(controlId: string): boolean {
  if (!inspectedNode.value) return false
  return uiStore.isControlExposed(inspectedNode.value.id, controlId)
}

// Panel width style
const panelStyle = computed(() => ({
  width: !uiStore.propertiesPanelOpen
    ? '0px'
    : uiStore.isMobile
      ? 'min(92vw, 360px)'
      : `${uiStore.propertiesPanelWidth}px`,
}))

// Format output value for display
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(3)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value.length > 20 ? value.slice(0, 20) + '...' : value
  if (Array.isArray(value)) return `Array[${value.length}]`
  if (value instanceof WebGLTexture) return 'WebGLTexture'
  if (typeof value === 'object') return 'Object'
  return String(value)
}

// Label editing
const isEditingLabel = ref(false)
const editedLabel = ref('')
const labelInputRef = ref<HTMLInputElement | null>(null)

// Template editor state
const templateEditorVisible = ref(false)
const templateEditorConnectionId = ref('')
const templateEditorTemplateId = ref<string | null>(null)

const nodeLabel = computed(() => {
  if (!inspectedNode.value) return ''
  return (inspectedNode.value.data?.label as string) || nodeDefinition.value?.name || 'Node'
})

function startEditingLabel() {
  editedLabel.value = nodeLabel.value
  isEditingLabel.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
    labelInputRef.value?.select()
  })
}

function saveLabel() {
  if (isEditingLabel.value && inspectedNode.value) {
    const trimmed = editedLabel.value.trim()
    if (trimmed && trimmed !== nodeLabel.value) {
      flowsStore.updateNodeData(inspectedNode.value.id, { label: trimmed })
    }
    isEditingLabel.value = false
  }
}

function onLabelKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveLabel()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    isEditingLabel.value = false
  }
}

// Reset editing state when node changes
watch(inspectedNode, () => {
  isEditingLabel.value = false
})

// Template select helpers
function getConnectionIdForTemplateSelect(connectionControlId: string): string {
  return (controlValues.value[connectionControlId] as string) ?? ''
}

function openTemplateEditor(connectionId: string, templateId?: string) {
  templateEditorConnectionId.value = connectionId
  templateEditorTemplateId.value = templateId ?? null
  templateEditorVisible.value = true
}

function closeTemplateEditor() {
  templateEditorVisible.value = false
  templateEditorConnectionId.value = ''
  templateEditorTemplateId.value = null
}

function handleTemplateSave(template: HttpEndpointTemplate) {
  const connectionId = templateEditorConnectionId.value
  const connectionsStore = useConnectionsStore()
  const connection = connectionsStore.connections.find(c => c.id === connectionId) as HttpConnectionConfig | undefined

  if (connection) {
    const templates = connection.templates ?? []
    const existingIndex = templates.findIndex(t => t.id === template.id)

    let updatedTemplates: HttpEndpointTemplate[]
    if (existingIndex >= 0) {
      updatedTemplates = [...templates]
      updatedTemplates[existingIndex] = template
    } else {
      updatedTemplates = [...templates, template]
    }

    // Update the connection config (cast to allow templates property)
    connectionsStore.updateConnection(connectionId, { templates: updatedTemplates } as Partial<HttpConnectionConfig>)
  }

  closeTemplateEditor()
}

function handleTemplateDelete(templateId: string) {
  const connectionId = templateEditorConnectionId.value
  const connectionsStore = useConnectionsStore()
  const connection = connectionsStore.connections.find(c => c.id === connectionId) as HttpConnectionConfig | undefined

  if (connection) {
    const templates = (connection.templates ?? []).filter(t => t.id !== templateId)

    // Update the connection config (cast to allow templates property)
    connectionsStore.updateConnection(connectionId, { templates } as Partial<HttpConnectionConfig>)
  }

  closeTemplateEditor()
}

// Navigate to a paired node in the palette
const searchSetByInfoTab = ref(false)

function searchForNode(nodeId: string) {
  const def = nodesStore.getDefinition(nodeId)
  if (def) {
    nodesStore.setSearchQuery(def.name)
    searchSetByInfoTab.value = true
  }
}

// Whether a control is visible, via the unified `when` evaluator. The panel honors the canonical
// `when` or the legacy `props.showWhen` (multi-key equality) mapped onto it — behavior unchanged.
function shouldShowControl(control: { when?: WhenSchema; props?: Record<string, unknown> }): boolean {
  const when = control.when ?? (control.props?.showWhen as WhenSchema | undefined)
  return evaluateWhen(when, controlValues.value)
}
</script>

<template>
  <aside
    class="properties-panel"
    :class="{ 'panel-overlay': uiStore.isMobile && uiStore.propertiesPanelOpen }"
    :style="panelStyle"
  >
    <div
      v-if="uiStore.propertiesPanelOpen"
      class="panel-content"
    >
      <!-- Header with tabs -->
      <div class="panel-header">
        <div class="panel-tabs">
          <button
            class="panel-tab"
            :class="{ active: activeTab === 'properties' }"
            @click="activeTab = 'properties'"
          >
            <Settings :size="14" />
            <span>Properties</span>
          </button>
          <button
            class="panel-tab"
            :class="{ active: activeTab === 'info' }"
            @click="activeTab = 'info'"
          >
            <Info :size="14" />
            <span>Info</span>
          </button>
          <button
            class="panel-tab"
            :class="{ active: activeTab === 'debug' }"
            @click="activeTab = 'debug'"
          >
            <Bug :size="14" />
            <span>Debug</span>
          </button>
        </div>
        <button
          class="close-btn"
          @click="uiStore.closePropertiesPanel"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Debug Panel Tab -->
      <DebugPanel v-if="activeTab === 'debug'" />

      <!-- Info Tab -->
      <div
        v-else-if="activeTab === 'info'"
        class="info-tab"
      >
        <div
          v-if="!inspectedNode || !nodeDefinition"
          class="empty-state"
        >
          <p>Select a node to view info</p>
        </div>
        <div
          v-else-if="!nodeDefinition.info"
          class="empty-state"
        >
          <p>No additional info available for this node.</p>
        </div>
        <div
          v-else
          class="info-content"
        >
          <!-- Overview -->
          <div class="info-section">
            <div class="section-header">
              <span>Overview</span>
            </div>
            <div class="info-body">
              <p class="info-overview">
                {{ nodeDefinition.info.overview }}
              </p>
            </div>
          </div>

          <!-- Tips -->
          <div
            v-if="nodeDefinition.info.tips && nodeDefinition.info.tips.length > 0"
            class="info-section"
          >
            <div class="section-header">
              <span>Tips</span>
            </div>
            <div class="info-body">
              <ul class="info-tips">
                <li
                  v-for="(tip, i) in nodeDefinition.info.tips"
                  :key="i"
                >
                  {{ tip }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Works Well With -->
          <div
            v-if="nodeDefinition.info.pairsWith && nodeDefinition.info.pairsWith.length > 0"
            class="info-section"
          >
            <div class="section-header">
              <span>Works Well With</span>
            </div>
            <div class="info-body">
              <div class="info-pairs">
                <button
                  v-for="pairedId in nodeDefinition.info.pairsWith"
                  :key="pairedId"
                  class="paired-node-chip"
                  :title="nodesStore.getDefinition(pairedId)?.description"
                  @click="searchForNode(pairedId)"
                >
                  {{ nodesStore.getDefinition(pairedId)?.name ?? pairedId }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Properties Tab -->
      <div
        v-else
        class="properties-tab"
      >
        <!-- No selection state -->
        <div
          v-if="!inspectedNode"
          class="empty-state"
        >
          <p>Select a node to view properties</p>
        </div>

        <!-- Node properties -->
        <div
          v-else
          class="node-properties"
        >
          <!-- Node info header -->
          <div class="node-info">
            <div class="node-info-top">
              <div
                class="node-category-badge"
                :style="{ background: categoryInfo?.color ?? 'var(--color-neutral-400)' }"
              >
                {{ categoryInfo?.label ?? 'Unknown' }}
              </div>
              <button
                class="delete-node-btn"
                title="Delete node"
                @click="deleteNode"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="node-name-row">
              <input
                v-if="isEditingLabel"
                ref="labelInputRef"
                v-model="editedLabel"
                type="text"
                class="node-name-input"
                @blur="saveLabel"
                @keydown="onLabelKeydown"
              >
              <h3
                v-else
                class="node-name"
                title="Click to edit label"
                @click="startEditingLabel"
              >
                {{ nodeLabel }}
              </h3>
              <button
                v-if="!isEditingLabel"
                class="edit-label-btn"
                title="Edit label"
                @click="startEditingLabel"
              >
                <Pencil :size="12" />
              </button>
            </div>
            <p class="node-description">
              {{ nodeDefinition?.description }}
            </p>
          </div>

          <!-- Texture Preview for visual nodes -->
          <div
            v-if="hasTextureOutput"
            class="texture-preview-section"
          >
            <div class="section-header">
              <span>Preview</span>
            </div>
            <TexturePreview
              :node-id="inspectedNode.id"
              :width="280"
              :height="180"
            />
          </div>

          <!-- Shader Editor Button -->
          <div
            v-if="isShaderNode"
            class="shader-editor-section"
          >
            <button
              class="shader-editor-btn"
              @click="openShaderEditor"
            >
              <Code :size="16" />
              <span>Open Shader Editor</span>
              <ChevronRight :size="16" />
            </button>
          </div>

          <!-- Code Editor Button -->
          <div
            v-if="isFunctionNode"
            class="shader-editor-section"
          >
            <button
              class="shader-editor-btn"
              @click="openCodeEditor"
            >
              <Code :size="16" />
              <span>Open Code Editor</span>
              <ChevronRight :size="16" />
            </button>
          </div>

          <!-- Controls Section -->
          <div
            v-if="nodeDefinition && nodeDefinition.controls.length > 0"
            class="controls-section"
          >
            <div class="section-header">
              <span>Controls</span>
            </div>

            <!-- Declarative `ui` schema → one NodeView interpreter (panel surface) -->
            <NodeView
              v-if="nodeDefinition.ui"
              :node-id="inspectedNode?.id ?? ''"
              :definition="nodeDefinition"
              :values="controlValues"
              surface="panel"
              class="controls-list"
              @update="updateControl"
            />

            <div
              v-else
              class="controls-list"
            >
              <div
                v-for="control in nodeDefinition.controls"
                v-show="shouldShowControl(control)"
                :key="control.id"
                class="control-item"
                :class="{ exposed: isExposed(control.id) }"
              >
                <div class="control-header">
                  <label class="control-label">{{ control.label }}</label>
                  <button
                    class="expose-btn"
                    :class="{ active: isExposed(control.id) }"
                    :title="isExposed(control.id) ? 'Remove from Control Panel' : 'Expose to Control Panel'"
                    @click="toggleControlExposure(control.id, control.label)"
                  >
                    <Check
                      v-if="isExposed(control.id)"
                      :size="12"
                    />
                    <Crosshair
                      v-else
                      :size="12"
                    />
                  </button>
                </div>

                <!-- Primitive widgets (number/slider/toggle/select/text/color) -->
                <ControlRenderer
                  v-if="usesRenderer(control.type)"
                  :control="control"
                  :model-value="controlValues[control.id]"
                  context="panel"
                  @update="(v) => updateControl(control.id, v)"
                />

                <!-- Connection selector -->
                <ConnectionSelect
                  v-else-if="control.type === 'connection'"
                  :model-value="(controlValues[control.id] as string | undefined)"
                  :protocol="(control.props?.protocol as string) ?? 'websocket'"
                  :placeholder="(control.props?.placeholder as string)"
                  @update:model-value="updateControl(control.id, $event)"
                />

                <!-- Template selector -->
                <TemplateSelect
                  v-else-if="control.type === 'template-select'"
                  :model-value="(controlValues[control.id] as string | undefined)"
                  :connection-id="getConnectionIdForTemplateSelect((control.props?.connectionControlId as string) ?? 'connectionId')"
                  :allow-inline="(control.props?.allowInline as boolean) ?? false"
                  :placeholder="(control.props?.placeholder as string)"
                  @update:model-value="updateControl(control.id, $event)"
                  @edit-template="openTemplateEditor(getConnectionIdForTemplateSelect((control.props?.connectionControlId as string) ?? 'connectionId'), $event)"
                  @add-template="openTemplateEditor(getConnectionIdForTemplateSelect((control.props?.connectionControlId as string) ?? 'connectionId'))"
                />

                <!-- Asset picker -->
                <AssetPickerControl
                  v-else-if="control.type === 'asset-picker'"
                  :model-value="(controlValues[control.id] as string | null)"
                  :asset-type="(control.props?.assetType as 'image' | 'video' | 'audio' | 'all')"
                  @update:model-value="updateControl(control.id, $event)"
                />

                <!-- Code (just show truncated) -->
                <div
                  v-else-if="control.type === 'code'"
                  class="control-code"
                >
                  <span class="code-preview">{{ (controlValues[control.id] as string)?.slice(0, 50) }}...</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Outputs Section -->
          <div
            v-if="nodeDefinition && nodeDefinition.outputs.length > 0"
            class="outputs-section"
          >
            <div class="section-header">
              <span>Outputs</span>
            </div>

            <div class="outputs-list">
              <div
                v-for="output in nodeDefinition.outputs"
                :key="output.id"
                class="output-item"
              >
                <span class="output-label">{{ output.label }}</span>
                <span class="output-type">{{ output.type }}</span>
                <span class="output-value">{{ formatValue(outputValues[output.id]) }}</span>
              </div>
            </div>
          </div>

          <!-- Inputs Section -->
          <div
            v-if="nodeDefinition && nodeDefinition.inputs.length > 0"
            class="inputs-section"
          >
            <div class="section-header">
              <span>Inputs</span>
            </div>

            <div class="inputs-list">
              <div
                v-for="input in nodeDefinition.inputs"
                :key="input.id"
                class="input-item"
              >
                <span class="input-label">{{ input.label }}</span>
                <span class="input-type">{{ input.type }}</span>
                <span
                  v-if="input.required"
                  class="input-required"
                >required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <!-- HTTP Template Editor Modal -->
  <HttpTemplateEditor
    :visible="templateEditorVisible"
    :connection-id="templateEditorConnectionId"
    :template-id="templateEditorTemplateId"
    @close="closeTemplateEditor"
    @save="handleTemplateSave"
    @delete="handleTemplateDelete"
  />
</template>

<style scoped>
.properties-panel {
  background: var(--color-neutral-50);
  border-left: 1px solid var(--color-neutral-200);
  overflow: hidden;
  transition: width var(--transition-default);
  flex-shrink: 0;
  position: relative;
}

/* Mobile: float over the canvas instead of taking a fixed column. */
.properties-panel.panel-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 50;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.25);
}

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-neutral-0);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  gap: var(--space-2);
}

.panel-tabs {
  display: flex;
  gap: var(--space-1);
}

.panel-tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.panel-tab:hover {
  color: var(--color-neutral-700);
  background: var(--color-neutral-100);
}

.panel-tab.active {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
}

.properties-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-600);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: var(--color-neutral-700);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-sm);
  padding: var(--space-4);
  text-align: center;
}

.node-properties {
  flex: 1;
  overflow-y: auto;
}

.node-info {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-100);
}

.node-info-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.node-category-badge {
  display: inline-block;
  padding: 2px var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: white;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  border-radius: 2px;
}

.delete-node-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.delete-node-btn:hover {
  background: var(--color-error);
  border-color: var(--color-error);
  color: white;
}

.node-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.node-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-900);
  margin: 0;
  cursor: pointer;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: var(--radius-xs);
  transition: background var(--transition-fast);
}

.node-name:hover {
  background: var(--color-neutral-100);
}

.node-name-input {
  flex: 1;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-900);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-primary-400);
  border-radius: var(--radius-xs);
  outline: none;
  background: var(--color-neutral-0);
}

.edit-label-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.edit-label-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-600);
}

.node-description {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-500);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.section-header {
  display: flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-100);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
}

/* Texture Preview Section */
.texture-preview-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

/* Shader Editor Section */
.shader-editor-section {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-neutral-100);
}

.shader-editor-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3);
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-200);
  color: var(--color-primary-600);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.shader-editor-btn:hover {
  background: var(--color-primary-100);
  border-color: var(--color-primary-300);
}

.shader-editor-btn span {
  flex: 1;
  text-align: left;
}

/* Controls Section */
.controls-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

.controls-list {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.control-item.exposed {
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-200);
}

.control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.control-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.expose-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.expose-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-600);
}

.expose-btn.active {
  background: var(--color-primary-500);
  border-color: var(--color-primary-500);
  color: white;
}

.expose-btn.active:hover {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}

/*
 * The primitive widgets (number/slider/toggle/select/text/color) + their styling now live in
 * the shared <ControlRenderer> (panel context). Only the code-preview widget stays inline.
 */
.control-code {
  padding: var(--space-2);
  background: var(--color-neutral-800);
  border-radius: var(--radius-xs);
}

.code-preview {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-300);
}

/* Outputs Section */
.outputs-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

.outputs-list {
  padding: var(--space-2) var(--space-4);
}

.output-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-neutral-50);
}

.output-item:last-child {
  border-bottom: none;
}

.output-label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.output-type {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  background: var(--color-neutral-100);
  padding: 1px var(--space-2);
  border-radius: 2px;
}

.output-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-primary-500);
  background: var(--color-primary-50);
  padding: 2px var(--space-2);
  border-radius: 2px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Inputs Section */
.inputs-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

.inputs-list {
  padding: var(--space-2) var(--space-4);
}

.input-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-neutral-50);
}

.input-item:last-child {
  border-bottom: none;
}

.input-label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.input-type {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  background: var(--color-neutral-100);
  padding: 1px var(--space-2);
  border-radius: 2px;
}

.input-required {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
  font-style: italic;
}

/* Info Tab */
.info-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.info-content {
  flex: 1;
  overflow-y: auto;
}

.info-section {
  border-bottom: 1px solid var(--color-neutral-100);
}

.info-body {
  padding: var(--space-3) var(--space-4);
}

.info-overview {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.info-tips {
  margin: 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.info-tips li {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  line-height: var(--line-height-relaxed);
}

.info-pairs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.paired-node-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.paired-node-chip:hover {
  background: var(--color-primary-100);
  border-color: var(--color-primary-300);
}
</style>
