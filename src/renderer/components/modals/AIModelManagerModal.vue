<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Download, Trash2, Loader, CheckCircle2, AlertCircle, Brain, Cpu, Zap, HardDrive, Play } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { aiInference, AI_MODELS, type ModelLoadState } from '@/services/ai/AIInference'
import { getStorageEstimate, type StorageEstimateInfo } from '@/services/ai/modelStorage'
import { WEBLLM_MODELS } from '@/registry/ai/llm'
import { webLLMService } from '@/services/ai/WebLLMService'

const uiStore = useUIStore()

// Reactive state
const modelStates = ref<Map<string, { state: ModelLoadState; progress: number; error?: string }>>(new Map())
const selectedModels = ref<Map<string, string>>(new Map())
const autoLoadModels = ref<Set<string>>(new Set())
const webgpuAvailable = ref(false)
const useWebGPU = ref(false)
const useBrowserCache = ref(true)
const clearingCache = ref(false)
const storageInfo = ref<StorageEstimateInfo | null>(null)

// --- Streaming chat LLMs (WebLLM) — user-managed loaded engines ---
const selectedWebLLM = ref<string>(WEBLLM_MODELS[0].id)
const webllmTick = ref(0) // bumped on service notify so the views below recompute
let webllmUnsub: (() => void) | null = null

const webllmLoaded = computed(() => {
  void webllmTick.value
  return webLLMService.loadedModels()
})
const selectedWebLLMState = computed(() => {
  void webllmTick.value
  return webLLMService.getLoadState(selectedWebLLM.value)
})
const selectedWebLLMLoaded = computed(() => {
  void webllmTick.value
  return webLLMService.isLoaded(selectedWebLLM.value)
})
function webllmName(id: string): string {
  return WEBLLM_MODELS.find((m) => m.id === id)?.name ?? id
}
function webllmSize(id: string): string {
  return WEBLLM_MODELS.find((m) => m.id === id)?.size ?? ''
}
function loadWebLLM(): void {
  void webLLMService.preload(selectedWebLLM.value)
}
function unloadWebLLM(id: string): void {
  void webLLMService.unload(id)
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

async function refreshStorageInfo() {
  storageInfo.value = await getStorageEstimate()
}

// Initialize selected models with defaults
let aiUnsubscribe: (() => void) | null = null

onMounted(async () => {
  // Load settings from storage first
  await aiInference.loadSettingsFromStorage()

  // Initialize with stored or default values
  const state = aiInference.getState()
  AI_MODELS.forEach(model => {
    const storedModel = state.selectedModels[model.id]
    selectedModels.value.set(model.id, storedModel || model.defaultModel)
  })

  // Load auto-load settings
  autoLoadModels.value = new Set(state.autoLoadModels)

  updateState()
  void refreshStorageInfo()

  // Subscribe to AI service state changes
  aiUnsubscribe = aiInference.subscribe(() => {
    updateState()
  })

  // Subscribe to WebLLM loaded-model changes
  webllmUnsub = webLLMService.subscribe(() => {
    webllmTick.value++
  })
})

onUnmounted(() => {
  aiUnsubscribe?.()
  webllmUnsub?.()
})

// Watch for modal open to refresh state
watch(() => uiStore.aiModelManagerOpen, (isOpen) => {
  if (isOpen) {
    updateState()
  }
})

function updateState() {
  const state = aiInference.getState()
  modelStates.value = new Map()

  for (const [key, info] of state.loadedModels) {
    modelStates.value.set(key, {
      state: info.state,
      progress: info.progress,
      error: info.error,
    })
  }

  webgpuAvailable.value = state.webgpuAvailable
  useWebGPU.value = state.useWebGPU
  useBrowserCache.value = state.useBrowserCache
  autoLoadModels.value = new Set(state.autoLoadModels)
}

function getTaskModelKey(taskId: string): string {
  const modelId = selectedModels.value.get(taskId)
  return `${taskId}:${modelId}`
}

function getModelState(taskId: string): ModelLoadState {
  const key = getTaskModelKey(taskId)
  return modelStates.value.get(key)?.state ?? 'idle'
}

function getModelProgress(taskId: string): number {
  const key = getTaskModelKey(taskId)
  return modelStates.value.get(key)?.progress ?? 0
}

function isModelLoaded(taskId: string): boolean {
  return getModelState(taskId) === 'ready'
}

function isModelLoading(taskId: string): boolean {
  return getModelState(taskId) === 'loading'
}

function isModelError(taskId: string): boolean {
  return getModelState(taskId) === 'error'
}

function getModelError(taskId: string): string | undefined {
  const key = getTaskModelKey(taskId)
  return modelStates.value.get(key)?.error
}

function getSelectedModelSize(taskId: string): string {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)
  if (!task) return ''

  if (modelId === task.defaultModel) {
    return task.defaultSize
  }

  const alt = task.alternateModels.find(m => m.id === modelId)
  return alt?.size ?? ''
}

function getSelectedModelLicense(taskId: string): string {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)
  if (!task) return ''
  if (modelId === task.defaultModel) return task.defaultLicense
  const alt = task.alternateModels.find(m => m.id === modelId)
  return alt?.license ?? task.defaultLicense
}

/** Licenses (Llama, Gemma) that require accepting terms on Hugging Face first. */
function isGatedLicense(license: string): boolean {
  return /^(llama|gemma)/i.test(license)
}

async function loadModel(taskId: string) {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)
  if (!task) return

  try {
    await aiInference.loadModel(task.task, modelId, () => {
      // Progress handled by subscription
    })
  } catch (error) {
    console.error(`Failed to load model for ${taskId}:`, error)
  }
}

async function unloadModel(taskId: string) {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)
  if (!task) return

  try {
    await aiInference.unloadModel(task.task, modelId)
  } catch (error) {
    console.error(`Failed to unload model for ${taskId}:`, error)
  }
}

function selectModel(taskId: string, modelId: string) {
  selectedModels.value.set(taskId, modelId)
  aiInference.setSelectedModel(taskId, modelId)
  saveSettings()
}

function isAutoLoadEnabled(taskId: string): boolean {
  const key = getTaskModelKey(taskId)
  return autoLoadModels.value.has(key)
}

function toggleAutoLoad(taskId: string) {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)
  if (!task || !modelId) return

  if (isAutoLoadEnabled(taskId)) {
    aiInference.removeAutoLoadModel(task.task, modelId)
  } else {
    aiInference.addAutoLoadModel(task.task, modelId)
  }
  saveSettings()
}

function toggleWebGPU() {
  aiInference.setUseWebGPU(!useWebGPU.value)
  saveSettings()
}

function toggleBrowserCache() {
  aiInference.setUseBrowserCache(!useBrowserCache.value)
  saveSettings()
}

// Save settings to persistent storage
async function saveSettings() {
  await aiInference.saveSettingsToStorage()
}

async function clearCache() {
  if (clearingCache.value) return

  clearingCache.value = true
  try {
    await aiInference.clearModelCache()
    // Update state after clearing
    updateState()
    void refreshStorageInfo()
  } catch (error) {
    console.error('Failed to clear cache:', error)
  } finally {
    clearingCache.value = false
  }
}

function close() {
  uiStore.closeAIModelManager()
}

// Count of loaded models
const loadedModelCount = computed(() => {
  let count = 0
  AI_MODELS.forEach(model => {
    if (isModelLoaded(model.id)) count++
  })
  return count
})

// Check if task supports WebGPU
function supportsWebGPU(taskId: string): boolean {
  const task = AI_MODELS.find(m => m.id === taskId)
  return task?.supportsWebGPU ?? false
}

// Get category badge color
function getCategoryColor(category: string): string {
  switch (category) {
    case 'text': return 'var(--color-primary-500)'
    case 'vision': return '#3B82F6'
    case 'audio': return '#22C55E'
    case 'multimodal': return '#F59E0B'
    default: return '#6B7280'
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="uiStore.aiModelManagerOpen"
        class="ai-modal-overlay"
        @click.self="close"
      >
        <div class="ai-modal">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <Brain
                :size="20"
                class="header-icon"
              />
              <h2 class="modal-title">
                Local AI Models
              </h2>
              <span class="model-count">{{ loadedModelCount }} loaded</span>
            </div>
            <button
              class="close-btn"
              @click="close"
            >
              <X :size="20" />
            </button>
          </div>

          <!-- Settings Bar -->
          <div class="settings-bar">
            <div class="setting-item">
              <Cpu :size="16" />
              <span>Models run locally in your browser</span>
            </div>
            <div class="settings-toggles">
              <!-- Cache toggle -->
              <div class="cache-toggle">
                <label class="toggle-label">
                  <input
                    type="checkbox"
                    :checked="useBrowserCache"
                    @change="toggleBrowserCache"
                  >
                  <span class="toggle-switch" />
                  <HardDrive :size="14" />
                  <span>Cache Models</span>
                </label>
              </div>
              <!-- WebGPU toggle -->
              <div
                v-if="webgpuAvailable"
                class="webgpu-toggle"
              >
                <label class="toggle-label">
                  <input
                    type="checkbox"
                    :checked="useWebGPU"
                    @change="toggleWebGPU"
                  >
                  <span class="toggle-switch" />
                  <Zap :size="14" />
                  <span>WebGPU</span>
                </label>
              </div>
              <!-- Clear cache button -->
              <button
                class="btn btn-clear-cache"
                :disabled="clearingCache"
                title="Clear downloaded model cache"
                @click="clearCache"
              >
                <Loader
                  v-if="clearingCache"
                  :size="14"
                  class="spin"
                />
                <Trash2
                  v-else
                  :size="14"
                />
                <span>Clear Cache</span>
              </button>
            </div>
            <div
              v-if="storageInfo"
              class="storage-info"
              :title="`${formatBytes(storageInfo.usage)} used of ~${formatBytes(storageInfo.quota)} (${Math.round(storageInfo.percentUsed * 100)}%)`"
            >
              <HardDrive :size="13" />
              <span>{{ formatBytes(storageInfo.available) }} free for models</span>
            </div>
          </div>

          <!-- Model List -->
          <div class="model-list">
            <!-- Streaming chat LLMs (WebGPU / MLC). Load one or more here; the
                 LLM (Streaming) node uses whichever model it requests. -->
            <div
              class="model-card webllm-card"
              :class="{ 'is-loaded': selectedWebLLMLoaded, 'is-loading': selectedWebLLMState?.status === 'loading' }"
            >
              <div class="model-info">
                <div class="model-header">
                  <h3 class="model-name">
                    Chat LLM (Streaming)
                  </h3>
                  <span
                    class="category-badge"
                    style="background: var(--color-primary-500)"
                  >webgpu</span>
                  <div class="model-status">
                    <CheckCircle2
                      v-if="selectedWebLLMLoaded"
                      :size="16"
                      class="status-icon ready"
                    />
                    <Loader
                      v-else-if="selectedWebLLMState?.status === 'loading'"
                      :size="16"
                      class="status-icon loading"
                    />
                  </div>
                </div>
                <p class="model-description">
                  Full chat models that stream token-by-token on your GPU (MLC / WebLLM).
                  Load one or more; an <strong>LLM (Streaming)</strong> node uses whichever
                  you pick. Each model uses GPU memory, so large ones add up.
                </p>

                <div class="model-selector">
                  <select
                    v-model="selectedWebLLM"
                    :disabled="!webgpuAvailable"
                    class="model-select"
                  >
                    <option
                      v-for="m in WEBLLM_MODELS"
                      :key="m.id"
                      :value="m.id"
                    >
                      {{ m.name }} ({{ m.size }})
                    </option>
                  </select>
                  <span class="selected-size">{{ webllmSize(selectedWebLLM) }}</span>
                </div>

                <!-- Loaded models (several may be loaded at once) -->
                <div
                  v-if="webllmLoaded.length"
                  class="webllm-loaded"
                >
                  <span
                    v-for="id in webllmLoaded"
                    :key="id"
                    class="webllm-chip loaded"
                    :title="id"
                  >
                    {{ webllmName(id) }}
                    <button
                      class="chip-x"
                      title="Unload"
                      aria-label="Unload model"
                      @click="unloadWebLLM(id)"
                    >
                      <X :size="11" />
                    </button>
                  </span>
                </div>

                <!-- Load progress -->
                <div
                  v-if="selectedWebLLMState?.status === 'loading'"
                  class="progress-container"
                >
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :style="{ width: `${Math.round((selectedWebLLMState.progress || 0) * 100)}%` }"
                    />
                  </div>
                  <span class="progress-text">{{ Math.round((selectedWebLLMState.progress || 0) * 100) }}%</span>
                </div>

                <div
                  v-if="selectedWebLLMState?.status === 'error'"
                  class="error-message"
                >
                  {{ selectedWebLLMState.error }}
                </div>
                <div
                  v-if="!webgpuAvailable"
                  class="webgpu-required"
                >
                  Requires WebGPU (Chrome/Edge desktop, or a WebGPU-capable browser).
                </div>
              </div>

              <div class="model-actions">
                <button
                  v-if="!selectedWebLLMLoaded"
                  class="btn btn-primary btn-sm"
                  :disabled="!webgpuAvailable || selectedWebLLMState?.status === 'loading'"
                  @click="loadWebLLM"
                >
                  <Download :size="14" />
                  <span>{{ selectedWebLLMState?.status === 'loading' ? 'Loading...' : 'Load' }}</span>
                </button>
                <button
                  v-else
                  class="btn btn-secondary btn-sm"
                  @click="unloadWebLLM(selectedWebLLM)"
                >
                  <Trash2 :size="14" />
                  <span>Unload</span>
                </button>
              </div>
            </div>

            <div
              v-for="task in AI_MODELS"
              :key="task.id"
              class="model-card"
              :class="{
                'is-loaded': isModelLoaded(task.id),
                'is-loading': isModelLoading(task.id),
                'is-error': isModelError(task.id),
              }"
            >
              <div class="model-info">
                <div class="model-header">
                  <h3 class="model-name">
                    {{ task.name }}
                  </h3>
                  <span
                    class="category-badge"
                    :style="{ background: getCategoryColor(task.category) }"
                  >
                    {{ task.category }}
                  </span>
                  <div class="model-status">
                    <CheckCircle2
                      v-if="isModelLoaded(task.id)"
                      :size="16"
                      class="status-icon ready"
                    />
                    <Loader
                      v-else-if="isModelLoading(task.id)"
                      :size="16"
                      class="status-icon loading"
                    />
                    <AlertCircle
                      v-else-if="isModelError(task.id)"
                      :size="16"
                      class="status-icon error"
                    />
                  </div>
                </div>
                <p class="model-description">
                  {{ task.description }}
                </p>

                <!-- Model selector with size info -->
                <div class="model-selector">
                  <select
                    :value="selectedModels.get(task.id)"
                    :disabled="isModelLoading(task.id)"
                    class="model-select"
                    @change="selectModel(task.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option :value="task.defaultModel">
                      {{ task.defaultModel.split('/').pop() }} ({{ task.defaultSize }})
                    </option>
                    <option
                      v-for="model in task.alternateModels"
                      :key="model.id"
                      :value="model.id"
                    >
                      {{ model.name }} ({{ model.size }})
                    </option>
                  </select>
                  <span class="selected-size">{{ getSelectedModelSize(task.id) }}</span>
                  <span
                    class="model-license"
                    :class="{ 'is-gated': isGatedLicense(getSelectedModelLicense(task.id)) }"
                    :title="isGatedLicense(getSelectedModelLicense(task.id))
                      ? `${getSelectedModelLicense(task.id)} license — requires accepting the model terms on Hugging Face before download`
                      : `License: ${getSelectedModelLicense(task.id)}`"
                  >
                    {{ getSelectedModelLicense(task.id) }}<template v-if="isGatedLicense(getSelectedModelLicense(task.id))"> · gated</template>
                  </span>
                </div>

                <!-- Auto-load toggle -->
                <div class="auto-load-toggle">
                  <label class="toggle-label small">
                    <input
                      type="checkbox"
                      :checked="isAutoLoadEnabled(task.id)"
                      :disabled="isModelLoading(task.id)"
                      @change="toggleAutoLoad(task.id)"
                    >
                    <span class="toggle-switch small" />
                    <Play :size="12" />
                    <span>Load on startup</span>
                  </label>
                </div>

                <!-- WebGPU indicator -->
                <div
                  v-if="supportsWebGPU(task.id) && useWebGPU"
                  class="webgpu-badge"
                >
                  <Zap :size="12" />
                  <span>WebGPU</span>
                </div>

                <!-- Loading progress -->
                <div
                  v-if="isModelLoading(task.id)"
                  class="progress-container"
                >
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :style="{ width: `${getModelProgress(task.id)}%` }"
                    />
                  </div>
                  <span class="progress-text">{{ Math.round(getModelProgress(task.id)) }}%</span>
                </div>

                <!-- Error message -->
                <div
                  v-if="isModelError(task.id)"
                  class="error-message"
                >
                  {{ getModelError(task.id) }}
                </div>
              </div>

              <div class="model-actions">
                <button
                  v-if="!isModelLoaded(task.id)"
                  class="btn btn-primary btn-sm"
                  :disabled="isModelLoading(task.id)"
                  @click="loadModel(task.id)"
                >
                  <Download :size="14" />
                  <span>{{ isModelLoading(task.id) ? 'Loading...' : 'Load' }}</span>
                </button>
                <button
                  v-else
                  class="btn btn-secondary btn-sm"
                  @click="unloadModel(task.id)"
                >
                  <Trash2 :size="14" />
                  <span>Unload</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <span class="footer-hint">
              Models from <a
                href="https://huggingface.co/models?library=transformers.js"
                target="_blank"
                rel="noopener"
              >Hugging Face Hub</a>
            </span>
            <button
              class="btn btn-secondary"
              @click="close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-6);
}

.ai-modal {
  width: 100%;
  max-width: 750px;
  max-height: 85vh;
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
  background: linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-500) 100%);
  border-bottom: 2px solid var(--color-primary-700);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon {
  color: white;
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: white;
}

.model-count {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.8);
  padding: 2px var(--space-2);
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
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
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: white;
}

.settings-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  flex-wrap: wrap;
  gap: var(--space-2);
}

.setting-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
}

.settings-toggles {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.storage-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.cache-toggle,
.webgpu-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.webgpu-hint {
  font-size: 10px;
  color: var(--color-neutral-400);
  margin-left: 24px;
}

.btn-clear-cache {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-clear-cache:hover:not(:disabled) {
  background: var(--color-neutral-200);
  color: var(--color-error);
  border-color: var(--color-error);
}

.btn-clear-cache:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-clear-cache .spin {
  animation: spin 1s linear infinite;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-700);
  cursor: pointer;
}

.toggle-label input {
  display: none;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-neutral-300);
  border-radius: 10px;
  transition: background var(--transition-fast);
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.toggle-label input:checked + .toggle-switch {
  background: var(--color-primary-500);
}

.toggle-label input:checked + .toggle-switch::after {
  transform: translateX(16px);
}

/* Small toggle variant */
.toggle-label.small {
  font-size: 11px;
}

.toggle-switch.small {
  width: 28px;
  height: 16px;
  border-radius: 8px;
}

.toggle-switch.small::after {
  width: 12px;
  height: 12px;
}

.toggle-label input:checked + .toggle-switch.small::after {
  transform: translateX(12px);
}

.auto-load-toggle {
  margin-bottom: var(--space-2);
}

.auto-load-toggle .toggle-label {
  color: var(--color-neutral-500);
}

.auto-load-toggle .toggle-label:has(input:checked) {
  color: #22C55E;
}

.auto-load-toggle .toggle-label input:checked + .toggle-switch {
  background: #22C55E;
}

.webgpu-unavailable {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
}

.model-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.model-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.model-card:hover {
  border-color: var(--color-neutral-300);
}

.model-card.is-loaded {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.1) 100%);
  border-color: #86efac;
}

.model-card.is-loading {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(168, 85, 247, 0.1) 100%);
  border-color: #C4B5FD;
}

.model-card.is-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.1) 100%);
  border-color: #fca5a5;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.model-name {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
}

.category-badge {
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  padding: 1px 6px;
  border-radius: 2px;
}

.status-icon {
  flex-shrink: 0;
}

.status-icon.ready {
  color: #22C55E;
}

.status-icon.loading {
  color: var(--color-primary-500);
  animation: spin 1s linear infinite;
}

.status-icon.error {
  color: var(--color-error);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.model-description {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.model-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.model-select {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--color-neutral-700);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.selected-size {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-600);
  white-space: nowrap;
}

.model-license {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
  white-space: nowrap;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
}

.model-license.is-gated {
  color: var(--color-warning);
  border-color: var(--color-warning);
}

.webllm-loaded {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.webllm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--color-neutral-700);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  padding: 2px 4px 2px var(--space-1);
  white-space: nowrap;
}

.webllm-chip.loaded {
  color: var(--color-success, #16a34a);
  border-color: color-mix(in srgb, var(--color-success, #16a34a) 50%, var(--color-neutral-200));
}

.webllm-chip .chip-x {
  display: inline-flex;
  align-items: center;
  padding: 1px;
  color: var(--color-neutral-500);
  background: none;
  border: 0;
  cursor: pointer;
}

.webllm-chip .chip-x:hover {
  color: var(--color-error, #dc2626);
}

.webgpu-required {
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.webgpu-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%);
  color: white;
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  border-radius: 2px;
  margin-bottom: var(--space-2);
}

.progress-container {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--color-neutral-200);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-500);
  min-width: 36px;
  text-align: right;
}

.error-message {
  margin-top: var(--space-2);
  padding: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-xs);
}

.model-actions {
  flex-shrink: 0;
}

.model-actions .btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-actions .btn-primary {
  background: linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%);
  color: white;
}

.model-actions .btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%);
}

.model-actions .btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-actions .btn-secondary {
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
}

.model-actions .btn-secondary:hover {
  background: var(--color-neutral-300);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-50);
  border-top: 1px solid var(--color-neutral-200);
}

.footer-hint {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.footer-hint a {
  color: var(--color-primary-500);
  text-decoration: none;
}

.footer-hint a:hover {
  text-decoration: underline;
}

.modal-footer .btn-secondary {
  padding: var(--space-2) var(--space-4);
  background: var(--color-neutral-200);
  border: none;
  color: var(--color-neutral-700);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.modal-footer .btn-secondary:hover {
  background: var(--color-neutral-300);
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

.modal-enter-from .ai-modal,
.modal-leave-to .ai-modal {
  transform: scale(0.95);
}
</style>
