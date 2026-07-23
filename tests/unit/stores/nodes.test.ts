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

/**
 * Regression: a node search must span every category. Scoping it to the selected
 * categoryFilter hid matching nodes in other categories — e.g. searching "eeg"
 * while the audio category was selected hid the connectivity "Muse EEG".
 */
describe('nodes store filteredDefinitions — search spans all categories', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('finds matches outside the selected category; category only scopes while browsing', () => {
    const store = useNodesStore()
    store.register({ ...def('muse-eeg'), name: 'Muse EEG', category: 'connectivity', tags: ['eeg', 'muse'] })
    store.register({ ...def('audio-gain'), name: 'Gain', category: 'audio', tags: ['audio'] })

    // Browsing the audio category with no query is scoped to it.
    store.setCategoryFilter('audio')
    store.setSearchQuery('')
    expect(store.filteredDefinitions.map((d) => d.id)).toEqual(['audio-gain'])

    // A search overrides the category scope: the connectivity node surfaces.
    store.setSearchQuery('eeg')
    const ids = store.filteredDefinitions.map((d) => d.id)
    expect(ids).toContain('muse-eeg')
    expect(ids).not.toContain('audio-gain')

    // Clearing the query restores the category-scoped browse view.
    store.setSearchQuery('')
    expect(store.filteredDefinitions.map((d) => d.id)).toEqual(['audio-gain'])
  })
})
