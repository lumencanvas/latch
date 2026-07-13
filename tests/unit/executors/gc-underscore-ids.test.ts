import { describe, it, expect } from 'vitest'
import { audioNodeBaseId } from '@/registry/audio/shared'
import { shaderCacheKeyOwned } from '@/registry/visual/shared'

/**
 * Regression guard for the `_`-split GC bug: gcAudioState/gcVisualState derived a
 * node's id from a composite cache key via `key.split('_')[0]`, but nanoid() ids
 * contain '_' (~26% of the time) — so a live node's id was truncated and its audio /
 * visual state was wrongly disposed on ANY unrelated node removal. See the
 * latch-nanoid-underscore-split memory. `idU` below is a realistic underscore id.
 */
const idU = 'V1_tZ8kqaB3xQ' // contains '_', as ~26% of nanoid ids do

describe('audioNodeBaseId — recovers the owning nodeId from an audioNodes key', () => {
  it('returns a bare nodeId unchanged (even with underscores)', () => {
    expect(audioNodeBaseId(idU)).toBe(idU)
  })

  it('strips every known suffix without truncating the id', () => {
    for (const sfx of ['meter', 'gain', 'input', 'fft', 'output']) {
      expect(audioNodeBaseId(`${idU}_${sfx}`)).toBe(idU)
    }
  })

  it('does NOT truncate at the first underscore (the old split bug)', () => {
    // Old code: `${idU}_meter`.split('_')[0] === 'V1' → live node not matched → disposed.
    expect(audioNodeBaseId(`${idU}_meter`)).not.toBe('V1')
    expect(audioNodeBaseId(`${idU}_meter`)).toBe(idU)
  })
})

describe('shaderCacheKeyOwned — keeps a valid node’s shader-cache entries', () => {
  const valid = new Set([idU])

  it('keeps the bare-id entry of a valid node', () => {
    expect(shaderCacheKeyOwned(idU, valid)).toBe(true)
  })

  it('keeps a cacheKey entry of a valid underscore id', () => {
    // cacheKey = `${nodeId}_${hash}_${hash}_${bool}_${num}`
    expect(shaderCacheKeyOwned(`${idU}_123456_0_false_2`, valid)).toBe(true)
  })

  it('regression: would have been wrongly dropped under split-on-underscore', () => {
    // split('_')[0] === 'V1' ∉ valid → old code deleted live material. Ownership keeps it.
    expect(shaderCacheKeyOwned(`${idU}_deadbeef`, valid)).toBe(true)
  })

  it('drops entries whose owner node is gone', () => {
    expect(shaderCacheKeyOwned(`${idU}_deadbeef`, new Set(['otherNode']))).toBe(false)
    expect(shaderCacheKeyOwned(idU, new Set(['otherNode']))).toBe(false)
  })
})
