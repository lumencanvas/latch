<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Brain, ChevronDown, ChevronUp, Download, Loader2, X } from 'lucide-vue-next'
import { aiInference, AI_MODELS } from '@/services/ai/AIInference'
import { webLLMService } from '@/services/ai/WebLLMService'
import { deriveWebllmCatalog } from '@/services/ai/models/webllm/derive'
import { modelNeeds, groupModelNeeds } from '@/services/ai/modelNeeds'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'

/**
 * Runtime status, top centre of the canvas:
 *  - a prompt when the running flow uses AI models that are not loaded (Load / Not now), and
 *  - a loading pill listing everything still loading (models, and nodes fetching their own files
 *    such as MediaPipe trackers or samples). Click an entry to jump to its node.
 */
const runtime = useRuntimeStore()
const flows = useFlowsStore()
const ui = useUIStore()

// aiInference is a plain service: mirror its change notifications into a reactive tick.
const aiTick = ref(0)
let unsubscribe: (() => void) | null = null
let unsubscribeLLM: (() => void) | null = null
const webllmCatalog = deriveWebllmCatalog()
onMounted(() => {
  unsubscribe = aiInference.subscribe(() => { aiTick.value++ })
  // WebLLM (the LLM node) loads in its own service; its downloads belong in the pill too.
  unsubscribeLLM = webLLMService.subscribe(() => { aiTick.value++ })
})
onUnmounted(() => { unsubscribeLLM?.() })
onUnmounted(() => unsubscribe?.())

const nodeLabel = (id: string) => {
  const n = flows.activeFlow?.nodes.find((x) => x.id === id)
  return (n?.data?.label as string) || (n?.data?.nodeType as string) || 'node'
}
const inFlow = (id: string) => !!flows.activeFlow?.nodes.some((n) => n.id === id)

function modelMeta(task: string, modelId: string) {
  const def = AI_MODELS.find((m) => m.task === task)
  const id = modelId || def?.defaultModel || ''
  const alt = def?.alternateModels.find((a) => a.id === id)
  return {
    id,
    name: alt?.name ?? (id.split('/').pop() || def?.name || task),
    task: def?.name ?? task,
    size: alt?.size ?? (id === def?.defaultModel ? def?.defaultSize : '') ?? '',
  }
}

// ── Prompt: models the running flow needs ──────────────────────────────────
const dismissed = ref(new Set<string>())
const loadErrors = ref(new Map<string, string>())
watch(() => runtime.isRunning, (on) => { if (on) { dismissed.value = new Set(); loadErrors.value = new Map() } })

const missing = computed(() => {
  void aiTick.value
  if (!runtime.isRunning) return []
  return groupModelNeeds([...modelNeeds.values()].filter((n) => inFlow(n.nodeId)))
    .map((g) => ({ ...g, key: `${g.task}:${g.modelId}`, meta: modelMeta(g.task, g.modelId), state: aiInference.getModelInfo(g.task, g.modelId || undefined)?.state }))
    .filter((g) => g.state !== 'loading' && g.state !== 'ready' && !dismissed.value.has(g.key))
})

function loadAll() {
  for (const g of missing.value) {
    loadErrors.value.delete(g.key)
    aiInference.loadModel(g.task, g.meta.id).catch((e: unknown) => {
      const next = new Map(loadErrors.value)
      next.set(g.key, (e as Error)?.message ?? String(e))
      loadErrors.value = next
    })
  }
}
function notNow() {
  const next = new Set(dismissed.value)
  for (const g of missing.value) next.add(g.key)
  dismissed.value = next
}

// ── Loading list ───────────────────────────────────────────────────────────
// Nodes whose model loads are tracked by aiInference (their own `loading` also means "inferring",
// which would make the pill flicker), so they are listed under their model instead.
const AI_MODEL_NODES = new Set([
  'speech-recognition', 'sentiment-analysis', 'text-generation', 'text-transformation', 'image-classification',
  'object-detection', 'object-detection-live', 'depth-estimation', 'feature-extraction', 'image-captioning',
  'vla', 'llm', 'retrieve', 'vector-memory', 'text-to-speech',
])

interface LoadingItem { key: string; label: string; detail: string; progress: number | null; nodeIds: string[] }

const loadingItems = computed<LoadingItem[]>(() => {
  void aiTick.value
  void runtime.nodeMetricsVersion
  const items: LoadingItem[] = []
  for (const [key, info] of aiInference.listModelInfo()) {
    if (info.state !== 'loading') continue
    const i = key.indexOf(':')
    const task = key.slice(0, i)
    const modelId = key.slice(i + 1)
    const meta = modelMeta(task, modelId)
    const nodeIds = [...modelNeeds.values()].filter((n) => n.task === task && (n.modelId || meta.id) === modelId && inFlow(n.nodeId)).map((n) => n.nodeId)
    items.push({ key, label: meta.name, detail: `${meta.task} model${meta.size ? ` · ${meta.size}` : ''}`, progress: Math.round(info.progress ?? 0), nodeIds })
  }
  for (const [modelId, st] of webLLMService.listLoadStates()) {
    if (st.status !== 'loading') continue
    const meta = webllmCatalog.find((m) => m.id === modelId)
    const nodeIds = (flows.activeFlow?.nodes ?? []).filter((n) => n.data?.nodeType === 'llm').map((n) => n.id)
    items.push({ key: `webllm:${modelId}`, label: meta?.name ?? modelId, detail: `LLM model${meta?.size ? ` · ${meta.size}` : ''}`, progress: Math.round((st.progress ?? 0) * 100), nodeIds })
  }
  if (runtime.isRunning) {
    for (const n of flows.activeFlow?.nodes ?? []) {
      const type = n.data?.nodeType as string
      if (AI_MODEL_NODES.has(type)) continue
      const out = runtime.nodeMetrics.get(n.id)?.outputValues as Record<string, unknown> | undefined
      if (out?.loading !== true) continue
      const p = typeof out.progress === 'number' ? out.progress : null
      items.push({ key: `node:${n.id}`, label: nodeLabel(n.id), detail: 'loading', progress: p !== null && p > 0 && p < 100 ? Math.round(p) : null, nodeIds: [n.id] })
    }
  }
  return items
})

// Hide blips: only show once something has been loading for a moment.
const visibleSince = ref(0)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 250) })
onUnmounted(() => { if (timer) clearInterval(timer) })
watch(() => loadingItems.value.length > 0, (any) => { visibleSince.value = any ? Date.now() : 0 }, { immediate: true })
const showPill = computed(() => loadingItems.value.length > 0 && now.value - visibleSince.value > 400)

const overall = computed(() => {
  const ps = loadingItems.value.map((i) => i.progress).filter((p): p is number => p !== null)
  return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null
})
const expanded = ref(false)

function focus(id: string | undefined) {
  if (id) ui.requestFocusNode(id)
}
</script>

<template>
  <div
    v-if="missing.length || showPill"
    class="runtime-status"
  >
    <!-- Models this flow needs -->
    <div
      v-if="missing.length"
      class="status-card"
      role="alertdialog"
      aria-labelledby="model-prompt-title"
    >
      <div class="card-head">
        <Brain :size="16" />
        <span id="model-prompt-title">
          This flow needs {{ missing.length === 1 ? 'an AI model' : `${missing.length} AI models` }} that {{ missing.length === 1 ? "isn't" : "aren't" }} loaded
        </span>
        <button
          class="icon-btn"
          aria-label="Not now"
          @click="notNow"
        >
          <X :size="14" />
        </button>
      </div>
      <ul class="model-list">
        <li
          v-for="g in missing"
          :key="g.key"
        >
          <span class="model-name">{{ g.meta.name }}</span>
          <span class="model-meta">{{ g.meta.task }}<template v-if="g.meta.size"> · {{ g.meta.size }}</template></span>
          <button
            class="node-link"
            :title="`Show ${nodeLabel(g.nodeIds[0])}`"
            @click="focus(g.nodeIds[0])"
          >
            {{ g.nodeIds.length === 1 ? nodeLabel(g.nodeIds[0]) : `${g.nodeIds.length} nodes` }}
          </button>
          <span
            v-if="loadErrors.get(g.key)"
            class="model-error"
          >{{ loadErrors.get(g.key) }}</span>
        </li>
      </ul>
      <p class="card-note">
        Models download once and are cached by your browser; they run on this device.
      </p>
      <div class="card-actions">
        <button
          class="btn btn-ghost btn-sm"
          @click="notNow"
        >
          Not now
        </button>
        <button
          class="btn btn-primary btn-sm"
          data-autofocus
          @click="loadAll"
        >
          <Download :size="14" /> Load {{ missing.length === 1 ? 'it' : 'all' }}
        </button>
      </div>
    </div>

    <!-- Everything still loading -->
    <div
      v-if="showPill"
      class="loading-pill"
      :class="{ open: expanded }"
    >
      <button
        class="pill-head"
        :aria-expanded="expanded"
        aria-label="Loading status"
        @click="expanded = !expanded"
      >
        <Loader2
          :size="14"
          class="spin"
        />
        <span>Loading {{ loadingItems.length }}{{ overall !== null ? ` · ${overall}%` : '' }}</span>
        <ChevronUp
          v-if="expanded"
          :size="14"
        />
        <ChevronDown
          v-else
          :size="14"
        />
      </button>
      <ul
        v-if="expanded"
        class="pill-list"
      >
        <li
          v-for="item in loadingItems"
          :key="item.key"
        >
          <button
            class="pill-item"
            :disabled="!item.nodeIds.length"
            :title="item.nodeIds.length ? 'Show the node' : ''"
            @click="focus(item.nodeIds[0])"
          >
            <span class="item-label">{{ item.label }}</span>
            <span class="item-detail">{{ item.detail }}<template v-if="item.nodeIds.length > 1"> · {{ item.nodeIds.length }} nodes</template></span>
            <span
              v-if="item.progress !== null"
              class="item-bar"
            ><span :style="{ width: `${item.progress}%` }" /></span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.runtime-status {
  position: fixed;
  top: calc(var(--header-height) + 44px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  pointer-events: none;
  max-width: min(440px, calc(100vw - 24px));
}

.status-card,
.loading-pill {
  pointer-events: auto;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  font-family: var(--font-mono);
}

.status-card {
  width: 100%;
  padding: var(--space-3);
}

.card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.card-head span {
  flex: 1;
}

.icon-btn {
  display: inline-flex;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
}

.model-list {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.model-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
}

.model-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.model-meta {
  color: var(--color-neutral-500);
}

.node-link {
  margin-left: auto;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--color-primary-600);
  text-decoration: underline;
  cursor: pointer;
}

.model-error {
  width: 100%;
  color: var(--color-error-600, #c62828);
}

.card-note {
  margin: var(--space-2) 0 0;
  font-size: 10px;
  color: var(--color-neutral-500);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.card-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.loading-pill {
  min-width: 200px;
  border-radius: var(--radius-xs);
}

.pill-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-3);
  border: none;
  background: transparent;
  font: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-neutral-800);
  cursor: pointer;
}

.pill-head span {
  flex: 1;
  text-align: left;
}

.pill-list {
  list-style: none;
  margin: 0;
  padding: 0 0 var(--space-1);
  border-top: 1px solid var(--color-neutral-200);
  max-height: 260px;
  overflow-y: auto;
}

.pill-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-3);
  border: none;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pill-item:hover:not(:disabled) {
  background: var(--color-neutral-100);
}

.pill-item:disabled {
  cursor: default;
}

.item-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.item-detail {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.item-bar {
  grid-column: 1 / -1;
  height: 3px;
  background: var(--color-neutral-200);
}

.item-bar span {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
  transition: width 0.3s;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}
</style>
