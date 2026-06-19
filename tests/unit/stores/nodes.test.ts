import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'

function def(id: string): NodeDefinition {
  return {
    id,
    name: id,
    version: '1.0.0',
    category: 'data',
    description: '',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [],
    controls: [],
  }
}

describe('nodes store register()', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('overwrites on a duplicate id (later wins) and warns in dev', () => {
    const store = useNodesStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    store.register(def('dup'))
    store.register({ ...def('dup'), name: 'second' })

    // Map semantics: the later registration wins — this is the bug the guard warns about.
    expect(store.getDefinition('dup')?.name).toBe('second')
    // The DEV guard surfaces the collision (no-op in a production build).
    if (import.meta.env.DEV) {
      expect(warn).toHaveBeenCalledTimes(1)
    }
    warn.mockRestore()
  })

  it('does not warn for distinct ids', () => {
    const store = useNodesStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    store.register(def('a'))
    store.register(def('b'))

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
