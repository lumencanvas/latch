import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineNodeState, collectedLifecycles, _resetLifecyclesForTest } from '@/engine/nodeState'

describe('defineNodeState', () => {
  beforeEach(() => _resetLifecyclesForTest())

  it('getOrCreate builds once and returns the same instance', () => {
    const s = defineNodeState<{ n: number }>()
    const a = s.getOrCreate('x', () => ({ n: 1 }))
    const b = s.getOrCreate('x', () => ({ n: 2 }))
    expect(a).toBe(b)
    expect(a.n).toBe(1)
    expect(s.size).toBe(1)
  })

  it('delete disposes the entry', () => {
    const dispose = vi.fn()
    const s = defineNodeState<number>({ dispose })
    s.set('x', 5)
    s.delete('x')
    expect(dispose).toHaveBeenCalledWith(5, 'x')
    expect(s.has('x')).toBe(false)
  })

  it('registers a lifecycle whose gc disposes orphaned nodes only', () => {
    const dispose = vi.fn()
    const s = defineNodeState<number>({ dispose, label: 'test' })
    s.set('keep', 1)
    s.set('drop', 2)

    const hooks = collectedLifecycles()
    expect(hooks).toHaveLength(1)
    hooks[0].gc(new Set(['keep']))

    expect(s.has('keep')).toBe(true)
    expect(s.has('drop')).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith(2, 'drop')
  })

  it('disposeAll disposes and clears every entry', () => {
    const dispose = vi.fn()
    const s = defineNodeState<number>({ dispose })
    s.set('a', 1)
    s.set('b', 2)
    collectedLifecycles()[0].disposeAll()
    expect(s.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('exposes gc/disposeAll on the store, delegating to the same logic as the lifecycle', () => {
    const dispose = vi.fn()
    const s = defineNodeState<number>({ dispose })
    s.set('keep', 1)
    s.set('drop', 2)

    s.gc(new Set(['keep']))
    expect(s.has('keep')).toBe(true)
    expect(s.has('drop')).toBe(false)
    expect(dispose).toHaveBeenCalledWith(2, 'drop')

    s.disposeAll()
    expect(s.size).toBe(0)
    expect(dispose).toHaveBeenCalledWith(1, 'keep')
  })

  it('keyToNodeId maps suffixed keys so gc keeps the live node', () => {
    const s = defineNodeState<number>({ keyToNodeId: (k) => k.split('_')[0] })
    s.set('n1_meter', 1)
    s.set('n2_meter', 2)
    collectedLifecycles()[0].gc(new Set(['n1']))
    expect(s.has('n1_meter')).toBe(true)
    expect(s.has('n2_meter')).toBe(false)
  })

  it('exposes optional onStart/endFrame hooks', () => {
    const onStart = vi.fn()
    const endFrame = vi.fn()
    defineNodeState({ onStart, endFrame })
    const lc = collectedLifecycles()[0]
    lc.onStart?.()
    lc.endFrame?.()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(endFrame).toHaveBeenCalledTimes(1)
  })

  it('each defineNodeState registers its own lifecycle', () => {
    defineNodeState({ label: 'a' })
    defineNodeState({ label: 'b' })
    expect(collectedLifecycles().map((l) => l.label)).toEqual(['a', 'b'])
  })
})
