import type { Env } from '@hackbuild/ai-env'
import { nodeSpecs } from '@/registry/nodeRegistry'
import { AI_MODELS, aiInference } from './AIInference'
import { fitFor, licenceBadge, modelRecord } from './modelRecords'
import { forgetModelUse, repoMatches } from './modelStorage'

export { lastUsedOf, markModelUsed, repoMatches } from './modelStorage'

/**
 * One view over every model LATCH can run (AI models plan, Phase 4): which flows use each one,
 * what is already downloaded and how big it is, when it was last used, and the facts the
 * Model Manager and the runtime prompt both show (size, licence, whether it fits here).
 */

export type Capability = 'vision' | 'audio' | 'text' | 'chat'

/** MediaPipe models load inside their nodes, from Google's model bucket (all Apache-2.0). */
export const MEDIAPIPE_MODELS = [
  { id: 'mediapipe:hand', nodeType: 'mediapipe-hand', task: 'hand' as const, name: 'Hand landmarks', size: '~7.8 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:face', nodeType: 'mediapipe-face', task: 'face' as const, name: 'Face landmarks', size: '~3.7 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:pose', nodeType: 'mediapipe-pose', task: 'pose' as const, name: 'Pose (lite)', size: '~5.8 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:object', nodeType: 'mediapipe-object', task: 'object' as const, name: 'Objects (EfficientDet-Lite0)', size: '~4.6 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:segmentation', nodeType: 'mediapipe-segmentation', task: 'segmentation' as const, name: 'Selfie segmentation', size: '~0.3 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:gesture', nodeType: 'mediapipe-gesture', task: 'gesture' as const, name: 'Gestures', size: '~8.4 MB', capability: 'vision' as Capability },
  { id: 'mediapipe:audio', nodeType: 'mediapipe-audio', task: 'audio' as const, name: 'Sound classes (YAMNet)', size: '~4 MB', capability: 'audio' as Capability },
]

/** What a catalog entry's category means for the filter (multimodal models read images). */
export function capabilityOf(category: string): Capability {
  return category === 'multimodal' ? 'vision' : (category as Capability)
}

// ── Which flows use which model ────────────────────────────────────────────

export interface ModelUse { flowId: string; flowName: string; nodeId: string; label: string }

interface FlowLike { id: string; name: string; nodes: ReadonlyArray<{ id: string; data?: Record<string, unknown> }> }

/**
 * Model id → the nodes that use it, across the given flows. A node's model is its `model` control,
 * or the task's current default when that is empty. The LLM node's models are WebLLM ids and the
 * MediaPipe nodes use `mediapipe:<task>`.
 */
export function modelUsage(flows: readonly FlowLike[], llmDefault = ''): Map<string, ModelUse[]> {
  const uses = new Map<string, ModelUse[]>()
  const add = (id: string, use: ModelUse) => {
    if (!id) return
    const list = uses.get(id) ?? []
    list.push(use)
    uses.set(id, list)
  }
  for (const flow of flows) {
    for (const node of flow.nodes) {
      const data = node.data ?? {}
      const type = data.nodeType as string | undefined
      if (!type) continue
      const use = { flowId: flow.id, flowName: flow.name, nodeId: node.id, label: (data.label as string) || type }
      const chosen = typeof data.model === 'string' ? data.model : ''
      if (type === 'llm') { add(chosen || llmDefault, use); continue }
      const mp = MEDIAPIPE_MODELS.find((m) => m.nodeType === type)
      if (mp) { add(mp.id, use); continue }
      for (const need of nodeSpecs[type]?.models ?? []) add(chosen || aiInference.getDefaultModel(need.task) || '', use)
    }
  }
  return uses
}

// ── What is downloaded ─────────────────────────────────────────────────────

export interface StoredModel { repo: string; bytes: number; files: number }

const HF_REPO = /\/\/(?:huggingface\.co|hf\.co)\/(.+?)\/resolve\//

/** The Hugging Face repo a cached weight URL belongs to, or null for anything else. */
export function repoOfUrl(url: string): string | null {
  return HF_REPO.exec(url)?.[1] ?? null
}

async function sizeOf(res: Response | undefined): Promise<number> {
  if (!res) return 0
  const len = Number(res.headers.get('content-length'))
  if (len > 0) return len
  try { return (await res.blob()).size } catch { return 0 }
}

/**
 * Every model in the browser's caches (transformers.js and WebLLM both keep weights in the Cache
 * API), grouped by repo, biggest first. Empty where the Cache API is missing. Never throws.
 */
export async function listStoredModels(): Promise<StoredModel[]> {
  if (typeof caches === 'undefined') return []
  const byRepo = new Map<string, StoredModel>()
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const req of await cache.keys()) {
        const repo = repoOfUrl(req.url)
        if (!repo) continue
        const entry = byRepo.get(repo) ?? { repo, bytes: 0, files: 0 }
        entry.bytes += await sizeOf(await cache.match(req))
        entry.files++
        byRepo.set(repo, entry)
      }
    }
  } catch { /* storage blocked: show nothing rather than fail */ }
  return [...byRepo.values()].sort((a, b) => b.bytes - a.bytes)
}

/** Delete one model's downloaded files from every cache. Returns the bytes freed. */
export async function deleteStoredModel(modelId: string): Promise<number> {
  if (typeof caches === 'undefined') return 0
  let freed = 0
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    for (const req of await cache.keys()) {
      const repo = repoOfUrl(req.url)
      if (!repo || !repoMatches(repo, modelId)) continue
      freed += await sizeOf(await cache.match(req))
      await cache.delete(req)
    }
  }
  forgetModelUse(modelId)
  return freed
}

// ── The facts shown wherever a model is offered ────────────────────────────

export interface ModelFacts {
  id: string
  name: string
  task: string
  size: string
  /** The licence, '' when unknown. */
  licence: string
  /** Set when the licence limits use (e.g. "non-commercial"). */
  badge: string | null
  /** Only when it won't run here, or only slowly, with the reason. */
  fitWarning: string
}

/** Facts for a task's model ('' = the task's current default). Shared by the manager and the prompt. */
export function modelFacts(task: string, modelId: string, env: Env | null): ModelFacts {
  const def = AI_MODELS.find((m) => m.task === task)
  const id = modelId || aiInference.getDefaultModel(task) || def?.defaultModel || ''
  const alt = def?.alternateModels.find((a) => a.id === id)
  const rec = modelRecord(id)
  const fit = env ? fitFor(id, env) : null
  return {
    id,
    name: alt?.name ?? (id.split('/').pop() || def?.name || task),
    task: def?.name ?? task,
    size: alt?.size ?? (id === def?.defaultModel ? def?.defaultSize : '') ?? '',
    licence: rec?.licence && rec.licence !== 'unknown' ? rec.licence : '',
    badge: licenceBadge(rec?.licence),
    fitWarning: fit && (!fit.ok || fit.fit === 'fits on cpu, slow') ? `${fit.fit}: ${fit.reason}` : '',
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 / 1024)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
