import { describe, it, expect, vi } from 'vitest'
import { nodeTypeColor } from '@/utils/nodeColor'
import { categoryMeta } from '@/stores/nodes'

const NEUTRAL = 'var(--color-neutral-400)'

describe('nodeTypeColor', () => {
  it('returns the category swatch colour via the injected resolver', () => {
    expect(nodeTypeColor('reverb', () => 'audio')).toBe(categoryMeta.audio.color)
    expect(nodeTypeColor('shader', () => 'visual')).toBe(categoryMeta.visual.color)
  })

  it('passes the node type through to the resolver (not something else)', () => {
    const getCategory = vi.fn(() => 'audio')
    nodeTypeColor('beat-detect', getCategory)
    expect(getCategory).toHaveBeenCalledWith('beat-detect')
  })

  it('falls back to neutral when the type has no known category', () => {
    expect(nodeTypeColor('mystery', () => undefined)).toBe(NEUTRAL)
  })

  it('falls back to neutral when the category is not in categoryMeta', () => {
    expect(nodeTypeColor('weird', () => 'not-a-category')).toBe(NEUTRAL)
  })
})
