<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Play, Pause, Save, RotateCcw, Info } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { getShaderRenderer, type CompiledShader } from '@/services/visual/ShaderRenderer'
import MonacoEditor from '@/components/editors/MonacoEditor.vue'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

// Local state
const code = ref('')
const originalCode = ref('')
const isPlaying = ref(true)
const error = ref<string | null>(null)
const showHelp = ref(false)

// Preview canvas
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewCtx = ref<CanvasRenderingContext2D | null>(null)

// Get the node being edited
const editingNode = computed(() => {
  if (!uiStore.shaderEditorNodeId || !flowsStore.activeFlow) return null
  return flowsStore.activeFlow.nodes.find(n => n.id === uiStore.shaderEditorNodeId) ?? null
})

// Get node definition
const nodeDefinition = computed(() => {
  if (!editingNode.value) return null
  const nodeType = editingNode.value.data?.nodeType as string
  return nodesStore.getDefinition(nodeType) ?? null
})

// Animation and rendering
let animationFrame: number | null = null
let compiledShader: CompiledShader | null = null
let startTime = 0

// Initialize code when node changes
watch(() => uiStore.shaderEditorNodeId, () => {
  if (editingNode.value) {
    const nodeCode = editingNode.value.data?.code as string ?? getDefaultShaderCode()
    code.value = nodeCode
    originalCode.value = nodeCode
    error.value = null
    compileShader()
  }
}, { immediate: true })

function getDefaultShaderCode(): string {
  return `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}`
}

function compileShader() {
  const renderer = getShaderRenderer()
  const result = renderer.compileShader(code.value, undefined, true)

  if ('error' in result) {
    error.value = result.error
    compiledShader = null
  } else {
    error.value = null
    compiledShader = result
  }
}

function renderPreview() {
  if (!previewCanvas.value || !previewCtx.value || !compiledShader) return

  const renderer = getShaderRenderer()
  const currentTime = (performance.now() - startTime) / 1000

  renderer.setTime(currentTime)
  renderer.render(compiledShader, [])

  // Copy to preview canvas
  const sourceCanvas = renderer.getCanvas()
  previewCtx.value.drawImage(sourceCanvas, 0, 0, 400, 300)
}

function startLoop() {
  startTime = performance.now()
  const loop = () => {
    if (isPlaying.value && uiStore.shaderEditorOpen) {
      renderPreview()
    }
    animationFrame = requestAnimationFrame(loop)
  }
  loop()
}

function stopLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

function handleCodeChange(newCode: string) {
  code.value = newCode
  // Debounced compilation
  compileShader()
}

function togglePlay() {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    startTime = performance.now()
  }
}

function resetTime() {
  startTime = performance.now()
}

function save() {
  if (editingNode.value) {
    flowsStore.updateNodeData(editingNode.value.id, {
      code: code.value,
    })
    originalCode.value = code.value
  }
  close()
}

function close() {
  uiStore.closeShaderEditor()
}

function revert() {
  code.value = originalCode.value
  compileShader()
}

const hasChanges = computed(() => code.value !== originalCode.value)

onMounted(() => {
  if (previewCanvas.value) {
    previewCtx.value = previewCanvas.value.getContext('2d')
    startLoop()
  }
})

onUnmounted(() => {
  stopLoop()
})

// Shadertoy uniforms help text
const uniformsHelp = [
  { name: 'iTime', type: 'float', desc: 'Playback time in seconds' },
  { name: 'iResolution', type: 'vec2', desc: 'Viewport resolution' },
  { name: 'iMouse', type: 'vec4', desc: 'Mouse position (xy: current, zw: click)' },
  { name: 'iFrame', type: 'int', desc: 'Frame count since start' },
  { name: 'iChannel0-3', type: 'sampler2D', desc: 'Input textures' },
  { name: 'fragCoord', type: 'vec2', desc: 'Pixel coordinate (defined macro)' },
]
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="uiStore.shaderEditorOpen"
        class="shader-editor-overlay"
        @click.self="close"
      >
        <div class="shader-editor-modal">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <h2 class="modal-title">
                Shader Editor
              </h2>
              <span
                v-if="nodeDefinition"
                class="node-name"
              >{{ nodeDefinition.name }}</span>
            </div>
            <div class="header-actions">
              <button
                class="action-btn"
                :class="{ active: showHelp }"
                title="Shadertoy Uniforms Help"
                @click="showHelp = !showHelp"
              >
                <Info :size="16" />
              </button>
              <button
                class="close-btn"
                @click="close"
              >
                <X :size="20" />
              </button>
            </div>
          </div>

          <!-- Help Panel -->
          <Transition name="slide">
            <div
              v-if="showHelp"
              class="help-panel"
            >
              <h4>Shadertoy Uniforms</h4>
              <div class="uniforms-list">
                <div
                  v-for="u in uniformsHelp"
                  :key="u.name"
                  class="uniform-item"
                >
                  <code class="uniform-name">{{ u.name }}</code>
                  <span class="uniform-type">{{ u.type }}</span>
                  <span class="uniform-desc">{{ u.desc }}</span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Main Content -->
          <div class="modal-content">
            <!-- Code Editor -->
            <div class="editor-pane">
              <div class="editor-header">
                <span>GLSL Code</span>
                <div class="editor-actions">
                  <button
                    v-if="hasChanges"
                    class="revert-btn"
                    title="Revert changes"
                    @click="revert"
                  >
                    <RotateCcw :size="14" />
                    Revert
                  </button>
                </div>
              </div>
              <MonacoEditor
                v-model="code"
                language="glsl"
                theme="vs-dark"
                class="code-editor"
                @update:model-value="handleCodeChange"
              />
              <div
                v-if="error"
                class="error-panel"
              >
                <span class="error-label">Error:</span>
                <span class="error-message">{{ error }}</span>
              </div>
            </div>

            <!-- Preview Pane -->
            <div class="preview-pane">
              <div class="preview-header">
                <span>Preview</span>
                <div class="preview-controls">
                  <button
                    class="control-btn"
                    :title="isPlaying ? 'Pause' : 'Play'"
                    @click="togglePlay"
                  >
                    <Pause
                      v-if="isPlaying"
                      :size="14"
                    />
                    <Play
                      v-else
                      :size="14"
                    />
                  </button>
                  <button
                    class="control-btn"
                    title="Reset time"
                    @click="resetTime"
                  >
                    <RotateCcw :size="14" />
                  </button>
                </div>
              </div>
              <div class="preview-container">
                <canvas
                  ref="previewCanvas"
                  width="400"
                  height="300"
                  class="preview-canvas"
                />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button
              class="cancel-btn"
              @click="close"
            >
              Cancel
            </button>
            <button
              class="save-btn"
              :disabled="!!error"
              @click="save"
            >
              <Save :size="14" />
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shader-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-6);
}

.shader-editor-modal {
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-300);
  box-shadow: 8px 8px 0 0 var(--color-neutral-400);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--color-neutral-800);
  border-bottom: 2px solid var(--color-neutral-700);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: white;
}

.node-name {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-400);
  padding: 2px var(--space-2);
  background: var(--color-neutral-700);
  border-radius: 2px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--color-neutral-700);
  border: none;
  color: var(--color-neutral-300);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-neutral-600);
  color: white;
}

.action-btn.active {
  background: var(--color-primary-500);
  color: white;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: white;
}

/* Help Panel */
.help-panel {
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-100);
  border-bottom: 1px solid var(--color-neutral-200);
}

.help-panel h4 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-600);
}

.uniforms-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.uniform-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  font-size: var(--font-size-xs);
}

.uniform-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary-600);
}

.uniform-type {
  color: var(--color-neutral-500);
  font-family: var(--font-mono);
}

.uniform-desc {
  color: var(--color-neutral-600);
}

/* Content */
.modal-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-neutral-200);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
}

.editor-actions {
  display: flex;
  gap: var(--space-2);
}

.revert-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  background: var(--color-warning);
  border: none;
  color: white;
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.revert-btn:hover {
  background: #d97706;
}

.code-editor {
  flex: 1;
  min-height: 300px;
}

.error-panel {
  padding: var(--space-2) var(--space-3);
  background: var(--color-error);
  color: white;
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
}

.error-label {
  font-weight: var(--font-weight-bold);
  margin-right: var(--space-2);
}

.preview-pane {
  width: 420px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-500);
}

.preview-controls {
  display: flex;
  gap: var(--space-1);
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-neutral-200);
  border: none;
  color: var(--color-neutral-600);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.control-btn:hover {
  background: var(--color-neutral-300);
  color: var(--color-neutral-800);
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  padding: var(--space-3);
}

.preview-canvas {
  max-width: 100%;
  max-height: 100%;
  border: 1px solid var(--color-neutral-700);
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-50);
  border-top: 1px solid var(--color-neutral-200);
}

.cancel-btn {
  padding: var(--space-2) var(--space-4);
  background: none;
  border: 1px solid var(--color-neutral-300);
  color: var(--color-neutral-600);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-neutral-100);
  border-color: var(--color-neutral-400);
}

.save-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary-500);
  border: none;
  color: white;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.save-btn:hover:not(:disabled) {
  background: var(--color-primary-600);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .shader-editor-modal,
.modal-leave-to .shader-editor-modal {
  transform: scale(0.95);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
