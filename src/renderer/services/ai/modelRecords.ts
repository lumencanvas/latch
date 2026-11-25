/**
 * LATCH's model specs as `@hackbuild/models` records: what each model provides, its size (and how
 * the size is known), its licence and whether that allows commercial use, and the ladder of
 * devices and precisions to try. With the device probe (`@hackbuild/ai-env`) this answers "will
 * this model run here, on what, and if not, why not" (`fitOf`), and tells the worker which rungs
 * to walk when it loads a model.
 */
import { probe, type Env } from '@hackbuild/ai-env'
import { fitOf, ladderFor, type FitResult, type ModelRecord, type Rung } from '@hackbuild/models'
import { modelSpecs } from './modelRegistry'
import type { ModelSpec } from './defineModel'

/** Default ladders per task, after hackbuild's measured presets (devices/src/ladders.ts). */
const TJS = (webgpu: Rung['dtype'][], wasm: Rung['dtype'][], wasmFirst = false): Rung[] => {
  const gpu = webgpu.map((dtype) => ({ device: 'webgpu' as const, dtype }))
  const cpu = wasm.map((dtype) => ({ device: 'wasm' as const, dtype }))
  return wasmFirst ? [...cpu, ...gpu] : [...gpu, ...cpu]
}

/** Classic encoder models (classification, detection, sentiment): fp16/fp32 on the GPU, q8 on CPU. */
const CLASSIC = TJS(['fp16', 'fp32'], ['q8', 'fp32'])

const TASK_LADDERS: Record<string, Rung[]> = {
  'text-generation': TJS(['q4f16', 'q4'], ['q4']),
  'text2text-generation': TJS(['fp32'], ['q8', 'fp32']),
  'sentiment-analysis': CLASSIC,
  'text-classification': CLASSIC,
  'feature-extraction': TJS(['fp32'], ['q8', 'fp32'], true), // small: CPU first, no GPU round trip
  'image-classification': CLASSIC,
  'object-detection': CLASSIC,
  'depth-estimation': TJS(['fp16', 'fp32'], ['q8', 'fp32']),
  'automatic-speech-recognition': TJS(
    [{ encoder_model: 'fp32', decoder_model_merged: 'q4' }],
    [{ encoder_model: 'q8', decoder_model_merged: 'q8' }],
  ),
  // fp32 vision encoder first: with fp16 encoders, SmolVLM on Chrome/M1 WebGPU captioned things
  // that weren't in the image (hackbuild, measured 2026-11-23).
  'image-text-to-text': TJS(
    [
      { embed_tokens: 'fp32', vision_encoder: 'fp32', decoder_model_merged: 'q4' },
      { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' },
    ],
    [{ embed_tokens: 'fp32', vision_encoder: 'q8', decoder_model_merged: 'q4' }],
  ),
}
const VLM_RE = /smolvlm|lfm2-vl/i
const FALLBACK_LADDER = TJS(['fp32'], ['q8', 'fp32'])

export function ladderOf(spec: ModelSpec): Rung[] {
  if (spec.ladder) return [...spec.ladder]
  if (spec.family === 'webllm') return [{ device: 'webgpu', dtype: spec.id.match(/q4f(16|32)_1/)?.[0] ?? 'q4f16_1' }]
  // A VLM serves captioning too: same weights, same ladder.
  if (VLM_RE.test(spec.id)) return TASK_LADDERS['image-text-to-text']
  return TASK_LADDERS[spec.task] ?? FALLBACK_LADDER
}

/** '~1.2 GB' → 1229, '~270 MB' → 270; null when unreadable. */
export function parseSizeMB(size: string | undefined): number | null {
  const m = size?.match(/([\d.]+)\s*(GB|MB)/i)
  if (!m) return null
  const n = Number(m[1])
  return Math.round(m[2].toUpperCase() === 'GB' ? n * 1024 : n)
}

/** Whether a licence allows commercial use: true, false, or 'unknown' when we can't say. */
export function commercialOf(licence: string | undefined): boolean | 'unknown' {
  const l = (licence ?? '').toLowerCase()
  if (!l) return 'unknown'
  if (/research|non-?commercial|cc-by-nc|agpl/.test(l)) return false
  if (/lfm/.test(l)) return 'unknown' // allowed below a revenue threshold: read the licence
  if (/apache|mit|bsd|llama|gemma|openrail|cc-by(?!-nc)/.test(l)) return true
  return 'unknown'
}

/** Restricted or copyleft licences get a badge next to the model (the person decides). */
export function licenceBadge(licence: string | undefined): string | null {
  const l = (licence ?? '').toLowerCase()
  if (/research|non-?commercial|cc-by-nc/.test(l)) return 'non-commercial'
  if (/lfm/.test(l)) return 'commercial use limited'
  if (/agpl|gpl/.test(l)) return 'copyleft'
  if (/llama|gemma/.test(l)) return 'terms apply'
  return null
}

const TASK_PROVIDES: Record<string, string[]> = {
  'text-generation': ['chat'],
  'text2text-generation': ['text2text'],
  'sentiment-analysis': ['classify.text'],
  'feature-extraction': ['embed'],
  'image-classification': ['classify.image'],
  'object-detection': ['detect'],
  'depth-estimation': ['depth'],
  'automatic-speech-recognition': ['transcribe'],
  'image-to-text': ['vision.caption'],
  'image-text-to-text': ['vision.ask', 'vision.caption'],
  'mask-generation': ['segment'],
}

export function recordOf(spec: ModelSpec): ModelRecord {
  const sizeMB = spec.sizeMB ?? parseSizeMB(spec.size)
  return {
    id: spec.id,
    label: spec.name,
    provides: TASK_PROVIDES[spec.task] ?? [spec.task],
    provider: spec.family === 'webllm' ? 'webllm' : spec.family === 'mediapipe' ? 'mediapipe' : 'tjs',
    source: spec.family === 'webllm' ? { modelId: spec.id } : { repo: spec.id },
    sizeMB,
    // The `size` strings were written by hand from download sizes: an estimate, not a measurement.
    sizeSource: spec.sizeSource ?? (sizeMB === null ? 'unknown' : 'inferred'),
    ladder: ladderOf(spec),
    licence: spec.license ?? 'unknown',
    commercial: commercialOf(spec.license),
  }
}

const records = new Map<string, ModelRecord>()
export function modelRecord(id: string): ModelRecord | undefined {
  let r = records.get(id)
  if (!r) {
    const spec = modelSpecs[id]
    if (!spec) return undefined
    r = recordOf(spec)
    records.set(id, r)
  }
  return r
}

// ── Device probe ────────────────────────────────────────────────────────────────
let envPromise: Promise<Env> | null = null
let envValue: Env | null = null
/** What this browser and device can do (WebGPU, shader-f16, memory, isolation…), probed once. */
export function getAiEnv(): Promise<Env> {
  envPromise ??= probe().then((e) => (envValue = e))
  return envPromise
}
/** The probe result once it has resolved (null before): for synchronous UI. */
export function aiEnvNow(): Env | null {
  return envValue
}

/** The rungs to try for a model on this device; `cpuOnly` drops the GPU rungs. */
export function rungsFor(id: string, env: Env | null, cpuOnly = false): Rung[] {
  const rec = modelRecord(id)
  if (!rec) return []
  const { rungs } = ladderFor(rec, env ?? undefined)
  return cpuOnly ? rungs.filter((r) => r.device !== 'webgpu') : rungs
}

/** Will this model run here, and if not, why not (hackbuild `fitOf`). Unknown until probed. */
export function fitFor(id: string, env: Env | null = envValue): FitResult | null {
  const rec = modelRecord(id)
  if (!rec || !env) return null
  return fitOf(rec, env)
}
