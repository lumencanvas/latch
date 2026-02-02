<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { X, Code, ChevronRight, Crosshair, Check, Trash2, Pencil, Settings, Bug, Info } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, categoryMeta, type NodeDefinition } from '@/stores/nodes'
import { useConnectionsStore } from '@/stores/connections'
import { useRuntimeStore } from '@/stores/runtime'
import TexturePreview from '@/components/preview/TexturePreview.vue'
import ConnectionSelect from '@/components/connections/ConnectionSelect.vue'
import TemplateSelect from '@/components/connections/TemplateSelect.vue'
import HttpTemplateEditor from '@/components/connections/HttpTemplateEditor.vue'
import AssetPickerControl from '@/components/controls/AssetPickerControl.vue'
import type { HttpConnectionConfig, HttpEndpointTemplate } from '@/services/connections/types'
import DebugPanel from '@/components/debug/DebugPanel.vue'
import { useDeviceEnumeration, type DeviceType, type DeviceOption } from '@/composables/useDeviceEnumeration'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()

// Panel tab state
type PanelTab = 'properties' | 'info' | 'debug'
const activeTab = ref<PanelTab>('properties')

// Switch to properties when a node is inspected
watch(() => uiStore.inspectedNode, (nodeId) => {
  if (nodeId) {
    activeTab.value = 'properties'
  }
  if (!nodeId && searchSetByInfoTab.value) {
    nodesStore.setSearchQuery('')
    searchSetByInfoTab.value = false
  }
})

// Device enumeration for audio/video selects
const { audioInputDevices, audioOutputDevices, videoInputDevices } = useDeviceEnumeration()

// Get options for a select control, supporting dynamic device enumeration
function getSelectOptions(control: { props?: Record<string, unknown> }): DeviceOption[] | string[] {
  const deviceType = control.props?.deviceType as DeviceType | undefined

  if (deviceType) {
    switch (deviceType) {
      case 'audio-input':
        return audioInputDevices.value
      case 'audio-output':
        return audioOutputDevices.value
      case 'video-input':
        return videoInputDevices.value
    }
  }

  return (control.props?.options as string[] | DeviceOption[]) ?? []
}

function isDeviceOptions(options: DeviceOption[] | string[]): options is DeviceOption[] {
  return options.length > 0 && typeof options[0] === 'object' && 'value' in options[0]
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

  // Update node data in flow store
  if (inspectedNode.value) {
    flowsStore.updateNodeData(inspectedNode.value.id, {
      [controlId]: value,
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
  width: uiStore.propertiesPanelOpen ? `${uiStore.propertiesPanelWidth}px` : '0px',
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

// Check if a control should be shown based on showWhen condition
function shouldShowControl(control: { props?: Record<string, unknown> }): boolean {
  const showWhen = control.props?.showWhen as Record<string, unknown> | undefined
  if (!showWhen) return true

  for (const [key, value] of Object.entries(showWhen)) {
    if (controlValues.value[key] !== value) {
      return false
    }
  }
  return true
}
</script>

<template>
  <aside
    class="properties-panel"
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

            <div class="controls-list">
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

                <!-- Number input -->
                <input
                  v-if="control.type === 'number'"
                  type="number"
                  class="control-input"
                  :value="(controlValues[control.id] as number) ?? 0"
                  :step="(control.props?.step as number) ?? 1"
                  @input="updateControl(control.id, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                >

                <!-- Slider -->
                <div
                  v-else-if="control.type === 'slider'"
                  class="control-slider"
                >
                  <input
                    type="range"
                    :value="(controlValues[control.id] as number) ?? 0"
                    :min="(control.props?.min as number) ?? 0"
                    :max="(control.props?.max as number) ?? 1"
                    :step="(control.props?.step as number) ?? 0.01"
                    @input="updateControl(control.id, parseFloat(($event.target as HTMLInputElement).value))"
                  >
                  <span class="slider-value">{{ ((controlValues[control.id] as number) ?? 0).toFixed(2) }}</span>
                </div>

                <!-- Toggle -->
                <label
                  v-else-if="control.type === 'toggle'"
                  class="control-toggle"
                >
                  <input
                    type="checkbox"
                    :checked="controlValues[control.id] as boolean"
                    @change="updateControl(control.id, ($event.target as HTMLInputElement).checked)"
                  >
                  <span class="toggle-track">
                    <span class="toggle-thumb" />
                  </span>
                </label>

                <!-- Select -->
                <select
                  v-else-if="control.type === 'select'"
                  class="control-select"
                  :value="controlValues[control.id]"
                  @change="updateControl(control.id, ($event.target as HTMLSelectElement).value)"
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

                <!-- Text input -->
                <input
                  v-else-if="control.type === 'text'"
                  type="text"
                  class="control-input"
                  :value="controlValues[control.id]"
                  :placeholder="(control.props?.placeholder as string) ?? ''"
                  @input="updateControl(control.id, ($event.target as HTMLInputElement).value)"
                >

                <!-- Color picker -->
                <div
                  v-else-if="control.type === 'color'"
                  class="control-color"
                >
                  <input
                    type="color"
                    :value="(controlValues[control.id] as string) ?? '#808080'"
                    @input="updateControl(control.id, ($event.target as HTMLInputElement).value)"
                  >
                  <span class="color-value">{{ controlValues[control.id] }}</span>
                </div>

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

.control-input {
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
}

.control-input:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

.control-slider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-slider input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--color-neutral-200);
  border-radius: 2px;
}

.control-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-primary-400);
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  min-width: 40px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  text-align: right;
}

.control-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.control-toggle input {
  display: none;
}

.toggle-track {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-neutral-200);
  border-radius: 10px;
  transition: background var(--transition-fast);
}

.control-toggle input:checked + .toggle-track {
  background: var(--color-primary-400);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.control-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
}

.control-select {
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  cursor: pointer;
}

.control-select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.control-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-color input[type="color"] {
  width: 36px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  -webkit-appearance: none;
}

.control-color input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.control-color input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.color-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  text-transform: uppercase;
}

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
