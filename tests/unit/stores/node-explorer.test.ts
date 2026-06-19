import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodeExplorerStore } from '@/stores/node-explorer'

describe('node-explorer store: tag filter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggleTag adds then removes a tag', () => {
    const s = useNodeExplorerStore()
    s.toggleTag('glitch')
    expect(s.selectedTags).toEqual(['glitch'])
    s.toggleTag('noise')
    expect(s.selectedTags).toEqual(['glitch', 'noise'])
    s.toggleTag('glitch') // toggle off
    expect(s.selectedTags).toEqual(['noise'])
  })

  it('clearTags empties the selection', () => {
    const s = useNodeExplorerStore()
    s.toggleTag('a')
    s.toggleTag('b')
    s.clearTags()
    expect(s.selectedTags).toEqual([])
  })

  it('changing category clears selected tags (avoids a stale filter showing nothing)', () => {
    const s = useNodeExplorerStore()
    s.toggleTag('echo')
    expect(s.selectedTags).toEqual(['echo'])
    s.selectCategory('audio')
    expect(s.selectedTags).toEqual([])
    expect(s.selectedCategory).toBe('audio')
  })
})
