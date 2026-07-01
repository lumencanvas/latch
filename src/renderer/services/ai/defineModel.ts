/**
 * `defineModel` — the unified AI-model manifest (EXTENSIBILITY_ARCHITECTURE §8).
 *
 * One tiny metadata file per model, co-located under `services/ai/models/` and
 * glob-collected, so the three catalogs that exist today in three shapes —
 * `AI_MODELS` (per-task, `AIInference.ts`), `WEBLLM_MODELS` (`registry/ai/llm.ts`),
 * and the hardcoded MediaPipe URLs (`MediaPipeService.ts`) — collapse to one
 * authored unit. A `.model.ts` carries *only metadata*; it never statically imports
 * the heavy runtime (transformers.js / web-llm / MediaPipe).
 *
 * **Frozen public contract** (POLICIES §2): additive-only within a major version,
 * like `defineNode`/`defineProtocol`.
 *
 * Live for webllm: the 25 `models/webllm/*.model.ts` specs are collected by
 * `modelRegistry` and `WEBLLM_MODELS` is derived from them (`models/webllm/derive.ts`),
 * so the count + prompt-format gates are real for that family. `AI_MODELS`
 * (transformers, a per-task rollup) and the MediaPipe URLs are still hand-authored,
 * pending their own sign-off-gated derives — see
 * `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md`.
 */

/** Which in-browser runtime loads + runs the model. */
export type ModelFamily = 'transformers' | 'webllm' | 'mediapipe'

/** How a text-generation model must be prompted (drives `textGenFormat`). */
export type PromptFormat = 'chat' | 'completion'

export interface ModelSpec {
  /** Repo id (transformers), MLC id (webllm), or MediaPipe asset id. The registry key. */
  readonly id: string
  /** Display name shown in model pickers. */
  readonly name: string
  /** In-browser runtime family. */
  readonly family: ModelFamily
  /** Pipeline task (transformers), or the coarse task for webllm/mediapipe. */
  readonly task: string
  /** Human-readable download size, e.g. `'~145 MB'`. */
  readonly size: string
  /** SPDX-ish license id (e.g. `'apache-2.0'`, `'mit'`, `'llama3.2'`). */
  readonly license?: string
  /** WebGPU acceleration available. */
  readonly supportsWebGPU?: boolean
  /**
   * Load-time hints. `promptFormat` is REQUIRED for text-generation specs (the
   * prompt-format contract gate enforces it); the worker only sees the id otherwise.
   */
  readonly load?: {
    promptFormat?: PromptFormat
  }
}

/**
 * A model/task need a node declares on its `defineNode` manifest (`NodeSpec.models`).
 * The future `defineNode` post-process derives an auto-populated `model` select +
 * standardized `loading`/`progress`/`done`/`error` outputs from these (§8); inert
 * until that lands — additive metadata for now, like `NodeConnectionRequirement`.
 */
export interface ModelRequirement {
  /** The model task this node needs (matches `ModelSpec.task` / `modelsByTask`). */
  task: string
  /** Expose an auto-populated `model` select for this task (default true). */
  selectable?: boolean
}

/**
 * Identity function that brands a `ModelSpec` as the single authored unit for a
 * model. Exists for inference + a stable authoring surface (every `*.model.ts`
 * exports the same shape), mirroring `defineNode` / `defineProtocol`.
 */
export function defineModel(spec: ModelSpec): ModelSpec {
  return spec
}
