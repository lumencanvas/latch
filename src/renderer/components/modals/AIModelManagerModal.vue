<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Download, Trash2, Loader, CheckCircle2, AlertCircle, Brain, Cpu, Zap, HardDrive, Play } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { aiInference, AI_MODELS, type ModelLoadState } from '@/services/ai/AIInference'
import { getStorageEstimate, type StorageEstimateInfo } from '@/services/ai/modelStorage'
import { WEBLLM_MODELS } from '@/registry/ai/llm/node'
import { webLLMService } from '@/services/ai/WebLLMService'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { fitFor, getAiEnv, licenceBadge, modelRecord } from '@/services/ai/modelRecords'
import type { Env } from '@hackbuild/ai-env'
import { useFlowsStore } from '@/stores/flows'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import {
  MEDIAPIPE_MODELS, capabilityOf, deleteStoredModel, formatBytes as formatSize, lastUsedOf, listStoredModels,
  modelUsage, repoMatches, type Capability, type ModelUse, type StoredModel,
} from '@/services/ai/modelInventory'

const uiStore = useUIStore()

const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => uiStore.aiModelManagerOpen,
  container: dialogRef,
  onClose: close,
})

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

// --- Fit and licence (hackbuild model records + the device probe) ---
const aiEnv = ref<Env | null>(null)
void getAiEnv().then((e) => { aiEnv.value = e })

/** Will this model run on this device, on what, and if not why ("needs f16", "over memory"…). */
function fitOfModel(id: string | undefined) {
  return id && aiEnv.value ? fitFor(id, aiEnv.value) : null
}
function badgeOf(id: string | undefined): string | null {
  return id ? licenceBadge(modelRecord(id)?.licence) : null
}
/** Where a loaded model actually runs, and what it fell back from. */
function loadedOn(taskId: string): string | null {
  const task = AI_MODELS.find((m) => m.id === taskId)
  const modelId = selectedModels.value.get(taskId)
  if (!task || !modelId) return null
  void modelStates.value
  const info = aiInference.getModelInfo(task.task, modelId)
  if (info?.state !== 'ready') return null
  const where = info.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU'
  const fell = info.fallbacks?.length ? ` after ${info.fallbacks.map((f) => `${f.device === 'webgpu' ? 'GPU' : 'CPU'} ${typeof f.dtype === 'string' ? f.dtype : 'mixed'} (${f.kind})`).join(', ')} failed` : ''
  return `Running on the ${where}, ${info.precision || info.dtype || ''}${fell}.`
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
  void refreshStored()

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
    void refreshStored()
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

// The service keys models by pipeline task (`image-text-to-text:<model>`), which differs from
// the catalog entry id for some rows (VLA's entry is 'vision-language'). Key by the task.
function getTaskModelKey(taskId: string): string {
  const modelId = selectedModels.value.get(taskId)
  const task = AI_MODELS.find(m => m.id === taskId)?.task ?? taskId
  return `${task}:${modelId}`
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
    void refreshStored()
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
    void refreshStored()
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

// --- One list over every family: filter, who uses what, what is downloaded (Phase 4) ---
const flowsStore = useFlowsStore()
const FILTERS: Array<{ id: 'all' | Capability; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'vision', label: 'Vision' }, { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' }, { id: 'chat', label: 'Chat' },
]
const filter = ref<'all' | Capability>('all')
const onlyUsed = ref(false)
const onlyStored = ref(false)
const stored = ref<StoredModel[]>([])
const storageBusy = ref(false)

const usage = computed(() => modelUsage(flowsStore.flows, WEBLLM_MODELS[0]?.id ?? ''))
function usesOf(ids: readonly string[]): ModelUse[] {
  return ids.flatMap((id) => usage.value.get(id) ?? [])
}
function usedIn(uses: ModelUse[]): string {
  const names = [...new Set(uses.map((u) => u.flowName))]
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}
function storedBytes(id: string | undefined): number {
  return id ? stored.value.filter((s) => repoMatches(s.repo, id)).reduce((n, s) => n + s.bytes, 0) : 0
}
const taskModelIds = (t: (typeof AI_MODELS)[number]) => [t.defaultModel, ...t.alternateModels.map((a) => a.id)]

const visibleTasks = computed(() => AI_MODELS.filter((t) => {
  if (filter.value !== 'all' && capabilityOf(t.category) !== filter.value) return false
  if (onlyUsed.value && !usesOf(taskModelIds(t)).length) return false
  if (onlyStored.value && !taskModelIds(t).some((id) => storedBytes(id) > 0)) return false
  return true
}))
const webllmIds = WEBLLM_MODELS.map((m) => m.id)
const showWebLLM = computed(() => (filter.value === 'all' || filter.value === 'chat' || filter.value === 'text')
  && (!onlyUsed.value || usesOf(webllmIds).length > 0)
  && (!onlyStored.value || webllmIds.some((id) => storedBytes(id) > 0)))
const showMediaPipe = computed(() => !onlyStored.value
  && (filter.value === 'all' || MEDIAPIPE_MODELS.some((m) => m.capability === filter.value))
  && (!onlyUsed.value || usesOf(MEDIAPIPE_MODELS.map((m) => m.id)).length > 0))
const mediapipeRows = computed(() => {
  void modelStates.value
  return MEDIAPIPE_MODELS.filter((m) => filter.value === 'all' || m.capability === filter.value)
    .map((m) => ({ ...m, loaded: mediaPipeService.isLoaded(m.task), uses: usage.value.get(m.id) ?? [] }))
})

/** Is anything with this repo loaded right now (either runtime)? */
function repoLoaded(repo: string): boolean {
  void modelStates.value
  void webllmTick.value
  for (const [key, info] of aiInference.getState().loadedModels) {
    if (info.state === 'ready' && repoMatches(repo, key.slice(key.indexOf(':') + 1))) return true
  }
  return webLLMService.loadedModels().some((id) => repoMatches(repo, id))
}
const storageRows = computed(() => stored.value.map((s) => {
  const uses = [...usage.value.entries()].filter(([id]) => repoMatches(s.repo, id)).flatMap(([, u]) => u)
  return { ...s, name: s.repo.split('/').pop() || s.repo, lastUsed: lastUsedOf(s.repo), uses, loaded: repoLoaded(s.repo) }
}))
const storedTotal = computed(() => stored.value.reduce((n, s) => n + s.bytes, 0))
const unusedRows = computed(() => storageRows.value.filter((r) => !r.uses.length && !r.loaded))

async function refreshStored() {
  stored.value = await listStoredModels()
}
async function removeStored(repos: string[]) {
  if (storageBusy.value) return
  storageBusy.value = true
  try {
    for (const repo of repos) await deleteStoredModel(repo)
  } finally {
    storageBusy.value = false
    await refreshStored()
    void refreshStorageInfo()
  }
}
function ago(at: number | null): string {
  if (!at) return 'never loaded here'
  const days = Math.floor((Date.now() - at) / 86_400_000)
  return days < 1 ? 'used today' : days === 1 ? 'used yesterday' : `used ${days} days ago`
}


// Get category badge color
function getCategoryColor(category: string): string {
  switch (category) {
    case 'text': return '#A855F7'
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
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="ai-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
        >
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <Brain
                :size="20"
                class="header-icon"
              />
              <h2
                id="ai-modal-title"
                class="modal-title"
              >
                Local AI Models
              </h2>
              <span class="model-count">{{ loadedModelCount }} loaded</span>
            </div>
            <button
              class="close-btn"
              aria-label="Close AI model manager"
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
                  <span title="Run models on the GPU (WebGPU) when they can. Off: CPU only, slower.">Use GPU</span>
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

          <!-- Filter: what it does, and whether flows use it or it is downloaded -->
          <div
            class="filter-bar"
            role="toolbar"
            aria-label="Filter models"
          >
            <button
              v-for="f in FILTERS"
              :key="f.id"
              class="filter-chip"
              :class="{ active: filter === f.id }"
              :aria-pressed="filter === f.id"
              @click="filter = f.id"
            >
              {{ f.label }}
            </button>
            <span class="filter-sep" />
            <button
              class="filter-chip"
              :class="{ active: onlyUsed }"
              :aria-pressed="onlyUsed"
              title="Only models a flow uses"
              @click="onlyUsed = !onlyUsed"
            >
              Used in flows
            </button>
            <button
              class="filter-chip"
              :class="{ active: onlyStored }"
              :aria-pressed="onlyStored"
              title="Only models already downloaded"
              @click="onlyStored = !onlyStored"
            >
              Downloaded
            </button>
          </div>

          <!-- Model List -->
          <div class="model-list">
            <!-- Streaming chat LLMs (WebGPU / MLC). Load one or more here; the
                 LLM (Streaming) node uses whichever model it requests. -->
            <div
              v-if="showWebLLM"
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
                    style="background: #a855f7"
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
                  <span
                    v-if="modelRecord(selectedWebLLM)"
                    class="model-license"
                    :class="{ 'is-gated': !!badgeOf(selectedWebLLM) }"
                    :title="`License: ${modelRecord(selectedWebLLM)?.licence}`"
                  >
                    {{ modelRecord(selectedWebLLM)?.licence }}<template v-if="badgeOf(selectedWebLLM)"> · {{ badgeOf(selectedWebLLM) }}</template>
                  </span>
                </div>
                <div
                  v-if="fitOfModel(selectedWebLLM)"
                  class="model-fit"
                  :class="{ 'is-bad': !fitOfModel(selectedWebLLM)?.ok }"
                >
                  <strong>{{ fitOfModel(selectedWebLLM)?.fit }}</strong> · {{ fitOfModel(selectedWebLLM)?.reason }}
                </div>
                <div
                  v-if="storedBytes(selectedWebLLM) || usesOf(webllmIds).length"
                  class="model-meta-line"
                >
                  <span v-if="storedBytes(selectedWebLLM)"><HardDrive :size="11" /> downloaded, {{ formatSize(storedBytes(selectedWebLLM)) }}</span>
                  <span
                    v-if="usesOf(webllmIds).length"
                    :title="usesOf(webllmIds).map((u) => `${u.flowName}: ${u.label}`).join('\n')"
                  >used in {{ usedIn(usesOf(webllmIds)) }}</span>
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
              v-for="task in visibleTasks"
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
                    {{ getSelectedModelLicense(task.id) }}<template v-if="isGatedLicense(getSelectedModelLicense(task.id))"> · gated</template><template v-else-if="badgeOf(selectedModels.get(task.id))"> · {{ badgeOf(selectedModels.get(task.id)) }}</template>
                  </span>
                </div>

                <!-- Will it run here, and where it runs once loaded -->
                <div
                  v-if="loadedOn(task.id)"
                  class="model-fit"
                >
                  <Zap :size="12" /> {{ loadedOn(task.id) }}
                </div>
                <div
                  v-else-if="fitOfModel(selectedModels.get(task.id))"
                  class="model-fit"
                  :class="{ 'is-bad': !fitOfModel(selectedModels.get(task.id))?.ok }"
                >
                  <strong>{{ fitOfModel(selectedModels.get(task.id))?.fit }}</strong> · {{ fitOfModel(selectedModels.get(task.id))?.reason }}
                </div>

                <div
                  v-if="storedBytes(selectedModels.get(task.id)) || usesOf(taskModelIds(task)).length"
                  class="model-meta-line"
                >
                  <span v-if="storedBytes(selectedModels.get(task.id))"><HardDrive :size="11" /> downloaded, {{ formatSize(storedBytes(selectedModels.get(task.id))) }}</span>
                  <span
                    v-if="usesOf(taskModelIds(task)).length"
                    :title="usesOf(taskModelIds(task)).map((u) => `${u.flowName}: ${u.label}`).join('\n')"
                  >used in {{ usedIn(usesOf(taskModelIds(task))) }}</span>
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

            <!-- MediaPipe: tracking models that load inside their nodes -->
            <div
              v-if="showMediaPipe"
              class="model-card"
            >
              <div class="model-info">
                <div class="model-header">
                  <h3 class="model-name">
                    MediaPipe tracking
                  </h3>
                  <span
                    class="category-badge"
                    :style="{ background: getCategoryColor('vision') }"
                  >vision · audio</span>
                </div>
                <p class="model-description">
                  Hands, face, pose, objects, segmentation, gestures and sound classes. Each MediaPipe
                  node loads its own small model when it first runs, on the GPU. Apache-2.0.
                </p>
                <ul class="mp-list">
                  <li
                    v-for="m in mediapipeRows"
                    :key="m.id"
                    :class="{ loaded: m.loaded }"
                  >
                    <span
                      class="mp-dot"
                      :title="m.loaded ? 'Loaded' : 'Not loaded'"
                    />
                    <span class="mp-name">{{ m.name }}</span>
                    <span class="mp-size">{{ m.size }}</span>
                    <span
                      v-if="m.uses.length"
                      class="mp-used"
                      :title="m.uses.map((u) => `${u.flowName}: ${u.label}`).join('\n')"
                    >used in {{ usedIn(m.uses) }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Downloads: what is on disk, biggest first -->
            <section
              class="storage-section"
              aria-labelledby="ai-storage-title"
            >
              <div class="storage-head">
                <h3
                  id="ai-storage-title"
                  class="model-name"
                >
                  <HardDrive :size="14" /> Downloaded models
                </h3>
                <span class="storage-total">{{ stored.length ? formatSize(storedTotal) : 'none yet' }}</span>
                <button
                  v-if="unusedRows.length"
                  class="btn btn-secondary btn-sm"
                  :disabled="storageBusy"
                  :title="`Delete ${unusedRows.length} downloaded model(s) that no flow uses and are not loaded. They download again if needed.`"
                  @click="removeStored(unusedRows.map((r) => r.repo))"
                >
                  <Trash2 :size="13" />
                  <span>Free {{ formatSize(unusedRows.reduce((n, r) => n + r.bytes, 0)) }} unused</span>
                </button>
              </div>
              <ul
                v-if="storageRows.length"
                class="storage-list"
              >
                <li
                  v-for="r in storageRows"
                  :key="r.repo"
                >
                  <span
                    class="st-name"
                    :title="r.repo"
                  >{{ r.name }}</span>
                  <span class="st-size">{{ formatSize(r.bytes) }}</span>
                  <span class="st-when">{{ r.loaded ? 'loaded now' : ago(r.lastUsed) }}</span>
                  <span
                    class="st-used"
                    :title="r.uses.map((u) => `${u.flowName}: ${u.label}`).join('\n')"
                  >{{ r.uses.length ? `used in ${usedIn(r.uses)}` : 'no flow uses it' }}</span>
                  <button
                    class="chip-x"
                    :disabled="storageBusy || r.loaded"
                    :title="r.loaded ? 'Unload it first' : 'Delete the download (it downloads again if needed)'"
                    :aria-label="`Delete ${r.name}`"
                    @click="removeStored([r.repo])"
                  >
                    <Trash2 :size="12" />
                  </button>
                </li>
              </ul>
            </section>
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
  background: linear-gradient(135deg, #7C3AED 0%, #A855F7 100%);
  border-bottom: 2px solid #6D28D9;
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
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-700);
  cursor: pointer;
}

/* Visually hide the checkbox but keep it focusable and in the tab order
   (display:none would make the toggle keyboard-inoperable — WCAG 2.1.1).
   Must stay the adjacent sibling of .toggle-switch for the :checked selectors. */
.toggle-label input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  margin: 0;
}

.toggle-label input:focus-visible + .toggle-switch {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
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
  background: #A855F7;
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
  color: #A855F7;
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
  background: linear-gradient(135deg, #A855F7 0%, #7C3AED 100%);
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
  background: linear-gradient(90deg, #A855F7 0%, #7C3AED 100%);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: #A855F7;
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
  background: linear-gradient(135deg, #A855F7 0%, #7C3AED 100%);
  color: white;
}

.model-actions .btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #9333EA 0%, #6D28D9 100%);
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
  color: #A855F7;
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

.model-fit {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-neutral-600);
}

.model-fit strong {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--color-success-700);
}

.model-fit.is-bad strong { color: var(--color-error); }
/* Phase 4: filter, usage, MediaPipe and downloads */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-neutral-200);
}

.filter-chip {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--color-neutral-600);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  padding: 2px var(--space-2);
  cursor: pointer;
}

.filter-chip:hover { border-color: var(--color-neutral-300); }

.filter-chip.active {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-500);
}

.filter-chip:focus-visible { outline: 2px solid var(--color-primary-500); outline-offset: 1px; }

.filter-sep {
  width: 1px;
  height: 16px;
  margin: 0 var(--space-1);
  background: var(--color-neutral-200);
}

.model-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.model-meta-line span { display: inline-flex; align-items: center; gap: 3px; }

.mp-list, .storage-list {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  font-size: var(--font-size-xs);
}

.mp-list li, .storage-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 0;
  border-top: 1px solid var(--color-neutral-100);
}

.mp-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--color-neutral-300);
}

.mp-list li.loaded .mp-dot { background: var(--color-success); }
.mp-name, .st-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-neutral-700); }
.mp-size, .st-size { font-family: var(--font-mono); color: var(--color-neutral-500); }
.mp-used, .st-used, .st-when { color: var(--color-neutral-500); white-space: nowrap; }

.storage-section {
  padding: var(--space-3);
  border: 1px dashed var(--color-neutral-300);
  border-radius: var(--radius-sm);
}

.storage-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.storage-head .model-name { display: inline-flex; align-items: center; gap: var(--space-1); }
.storage-total { flex: 1; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-neutral-500); }

.storage-list .chip-x {
  display: inline-flex;
  padding: 2px;
  color: var(--color-neutral-500);
  background: none;
  border: 0;
  cursor: pointer;
}

.storage-list .chip-x:hover:not(:disabled) { color: var(--color-error); }
.storage-list .chip-x:disabled { opacity: 0.4; cursor: default; }
</style>
