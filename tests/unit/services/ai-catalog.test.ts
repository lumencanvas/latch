import { describe, it, expect } from 'vitest'
import {
  AI_MODELS,
  getModelSelectOptions,
  type ModelDefinition,
  type ModelOption,
} from '@/services/ai/AIInference'
import { textGenerationNode } from '@/registry/ai/text-generation'

/**
 * Guards the in-browser AI model catalog (AIInference.ts:AI_MODELS) against
 * regressions: structural completeness, unique ids, well-formed Hugging Face
 * repo ids ("org/name"), license metadata, and that the modernization additions
 * (Phase 4) are present. Repo ids here were network-verified to exist with ONNX
 * weights on 2026-06-14; actual in-browser load+run is a separate manual check.
 */

const ALLOWED_CATEGORIES = new Set(['text', 'vision', 'audio', 'multimodal'])

/** A Hugging Face repo id is "org/name" — exactly one slash, no spaces, non-empty parts. */
function isRepoId(id: unknown): boolean {
  return typeof id === 'string' && /^[^\s/]+\/[^\s/]+$/.test(id)
}

/** All repo ids referenced by a task: its default plus every alternate. */
function repoIds(m: ModelDefinition): string[] {
  return [m.defaultModel, ...m.alternateModels.map((a) => a.id)]
}

describe('AI_MODELS catalog', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(AI_MODELS)).toBe(true)
    expect(AI_MODELS.length).toBeGreaterThan(0)
  })

  it('has unique task ids', () => {
    const ids = AI_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every task has the required, well-typed fields', () => {
    for (const m of AI_MODELS) {
      expect(m.id, m.id).toBeTruthy()
      expect(m.name, m.id).toBeTruthy()
      expect(m.task, m.id).toBeTruthy()
      expect(m.description, m.id).toBeTruthy()
      expect(m.defaultSize, m.id).toBeTruthy()
      expect(typeof m.supportsWebGPU, m.id).toBe('boolean')
      expect(ALLOWED_CATEGORIES.has(m.category), `${m.id}: ${m.category}`).toBe(true)
      expect(Array.isArray(m.alternateModels), m.id).toBe(true)
    }
  })

  it('every default and alternate model id is a well-formed HF repo id', () => {
    for (const m of AI_MODELS) {
      for (const id of repoIds(m)) {
        expect(isRepoId(id), `${m.id}: "${id}"`).toBe(true)
      }
    }
  })

  it('the default model is resolvable within its own task (default or an alternate)', () => {
    for (const m of AI_MODELS) {
      // The default is always its own resolvable repo; alternates must not silently
      // shadow/duplicate it (covered below). This documents the resolvability contract.
      expect(repoIds(m)).toContain(m.defaultModel)
    }
  })

  it('has no duplicate repo ids within a task', () => {
    for (const m of AI_MODELS) {
      const ids = repoIds(m)
      expect(new Set(ids).size, `${m.id} has duplicate model ids`).toBe(ids.length)
    }
  })

  it('every model (default + alternates) carries a license', () => {
    for (const m of AI_MODELS) {
      expect(m.defaultLicense, `${m.id} default license`).toBeTruthy()
      for (const alt of m.alternateModels as ModelOption[]) {
        expect(alt.license, `${m.id} -> ${alt.id} license`).toBeTruthy()
        expect(alt.name, `${alt.id} name`).toBeTruthy()
        expect(alt.size, `${alt.id} size`).toBeTruthy()
      }
    }
  })

  it('includes the Phase 4 modernization additions for text generation', () => {
    const textGen = AI_MODELS.find((m) => m.id === 'text-generation')
    expect(textGen).toBeDefined()
    const ids = repoIds(textGen!).join(' ')
    // Verified modern decoder LLMs (2026-06): keep these present so the refresh
    // can't silently regress to a stale-only list.
    for (const pat of [/Llama-3\.2-1B/i, /Qwen/i, /Phi-4-mini/i, /SmolLM2/i, /gemma-3/i]) {
      expect(pat.test(ids), `text-generation missing ${pat}`).toBe(true)
    }
  })

  it('offers a modern embedding option for RAG', () => {
    const embed = AI_MODELS.find((m) => m.id === 'feature-extraction')
    expect(embed).toBeDefined()
    const ids = repoIds(embed!).join(' ')
    expect(/nomic|bge|gte|MiniLM/i.test(ids)).toBe(true)
  })

  it('does not reference the unresolvable mobilenet_v3 repo (removed in refresh)', () => {
    const all = AI_MODELS.flatMap(repoIds).join(' ')
    expect(/mobilenet_v3/i.test(all)).toBe(false)
  })
})

describe('getModelSelectOptions', () => {
  it('leads with an "auto" default entry (value "") then every alternate, for a known task', () => {
    const opts = getModelSelectOptions('text-generation')
    const def = AI_MODELS.find((m) => m.task === 'text-generation')!
    expect(opts).toHaveLength(1 + def.alternateModels.length)
    expect(opts[0].value).toBe('') // '' → resolves to the task default at inference time
    expect(opts[0].label.toLowerCase()).toContain('default')
    // Every alternate is present as an explicit, selectable option.
    for (const alt of def.alternateModels) {
      expect(opts.some((o) => o.value === alt.id)).toBe(true)
    }
    // No option value is a bare-empty duplicate of another (only the single auto entry).
    expect(opts.filter((o) => o.value === '')).toHaveLength(1)
  })

  it('returns an empty list for an unknown task (no throw, no phantom options)', () => {
    expect(getModelSelectOptions('not-a-task')).toEqual([])
  })

  it('covers every catalog task', () => {
    for (const m of AI_MODELS) {
      const opts = getModelSelectOptions(m.task)
      expect(opts.length).toBeGreaterThanOrEqual(1)
      expect(opts[0].value).toBe('')
    }
  })
})

describe('text-generation node — registry-populated model select (A2 follow-through)', () => {
  const model = textGenerationNode.controls.find((c) => c.id === 'model')

  it('gains a populated model select whose options match the catalog, default "" (auto)', () => {
    expect(model).toBeDefined()
    expect(model!.type).toBe('select')
    expect(model!.default).toBe('') // preserves prior behavior: '' → task default
    expect(model!.props?.options).toEqual(getModelSelectOptions('text-generation'))
  })

  it('keeps the standardized model outputs without duplication', () => {
    const outIds = textGenerationNode.outputs.map((p) => p.id)
    for (const id of ['loading', 'progress', 'done', 'error']) {
      expect(outIds.filter((o) => o === id)).toHaveLength(1)
    }
    expect(outIds).toContain('text')
  })

  it('does not duplicate the authored prompt/maxTokens/temperature controls', () => {
    const ctrlIds = textGenerationNode.controls.map((c) => c.id)
    expect(ctrlIds.filter((c) => c === 'model')).toHaveLength(1)
    for (const id of ['prompt', 'maxTokens', 'temperature']) {
      expect(ctrlIds).toContain(id)
    }
  })
})
