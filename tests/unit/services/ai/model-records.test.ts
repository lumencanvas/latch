import { describe, it, expect } from 'vitest'
import { validateRecord } from '@hackbuild/models'
import type { Env } from '@hackbuild/ai-env'
import { modelSpecs } from '@/services/ai/modelRegistry'
import { commercialOf, fitFor, ladderOf, licenceBadge, modelRecord, parseSizeMB, rungsFor } from '@/services/ai/modelRecords'

/** AI models plan, Phase 1: LATCH specs as hackbuild records, with ladders, fit and licences. */

const env = (over: Partial<Env> = {}): Env => ({
  webgpu: true, f16: true, adapter: null, maxBufferBytes: null, isolated: true, protocol: 'https',
  opfs: true, cacheStorage: true, indexedDB: true, threads: 4, deviceMemoryGB: 8, promptApi: false, notes: [],
  ...over,
})

describe('model records', () => {
  it('every model spec becomes a valid record with a licence', () => {
    const ids = Object.keys(modelSpecs)
    expect(ids.length).toBeGreaterThan(50)
    for (const id of ids) {
      const rec = modelRecord(id)!
      expect(() => validateRecord(rec), id).not.toThrow()
      expect(rec.licence, id).not.toBe('unknown')
      expect(rec.ladder.length, id).toBeGreaterThan(0)
    }
  })

  it('reads sizes, and marks hand-written ones as estimates', () => {
    expect(parseSizeMB('~1.2 GB')).toBe(1229)
    expect(parseSizeMB('~270 MB')).toBe(270)
    expect(parseSizeMB('large')).toBeNull()
    expect(modelRecord('Xenova/all-MiniLM-L6-v2')?.sizeSource).toBe('inferred')
  })

  it('knows which licences limit use', () => {
    expect(commercialOf('apache-2.0')).toBe(true)
    expect(commercialOf('qwen-research')).toBe(false)
    expect(commercialOf('')).toBe('unknown')
    expect(licenceBadge('qwen-research')).toBe('non-commercial')
    expect(licenceBadge('llama3.2')).toBe('terms apply')
    expect(licenceBadge('mit')).toBeNull()
  })

  it('SmolVLM keeps its vision encoder in fp32 on the GPU first (fp16 captioned the wrong thing)', () => {
    const ladder = ladderOf(modelSpecs['HuggingFaceTB/SmolVLM-256M-Instruct'])
    expect(ladder[0]).toEqual({ device: 'webgpu', dtype: { embed_tokens: 'fp32', vision_encoder: 'fp32', decoder_model_merged: 'q4' } })
    expect(ladder.at(-1)?.device).toBe('wasm')
  })

  it('says whether a model runs here, and why not', () => {
    const depth = 'onnx-community/depth-anything-v2-small'
    expect(fitFor(depth, env())?.fit).toBe('fits')
    expect(fitFor(depth, env({ webgpu: false, f16: false }))?.fit).toBe('fits on cpu, slow')
    const llm = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
    expect(fitFor(llm, env({ webgpu: false, f16: false }))?.fit).toBe('needs webgpu')
    expect(fitFor(llm, env({ f16: false }))?.fit).toBe('needs f16')
    expect(fitFor('Llama-3.1-8B-Instruct-q4f16_1-MLC', env({ deviceMemoryGB: 4 }))?.fit).toBe('over memory')
  })

  it('drops the GPU rungs when the person chose CPU only, and f16 rungs without shader-f16', () => {
    const depth = 'onnx-community/depth-anything-v2-small'
    expect(rungsFor(depth, env(), true).every((r) => r.device === 'wasm')).toBe(true)
    const noF16 = rungsFor(depth, env({ f16: false }))
    expect(noF16[0]).toEqual({ device: 'webgpu', dtype: 'fp32' })
  })
})
