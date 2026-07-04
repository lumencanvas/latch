import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useAssetsStore } from '@/stores/assets'
import AssetCard from '@/components/assets/AssetCard.vue'
import type { Asset } from '@/services/database'

/**
 * AssetCard keyboard a11y (WCAG 2.1.1 / 4.1.2). The card used to be a mouse-only
 * <div @click>, so a keyboard user could never select an asset. The select target
 * is now a real <button> (Tab-reachable, Enter/Space-activatable) with an
 * accessible name, and the delete control is a named sibling button — no nested
 * interactive content.
 */
const asset: Asset = {
  id: 'asset_1',
  name: 'clip.mp4',
  type: 'video',
  size: 4096,
  duration: 12,
  width: 640,
  height: 480,
  // remaining Asset fields are not read by the card
} as Asset

describe('AssetCard keyboard accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useAssetsStore()
    store.getThumbnailUrl = vi.fn().mockResolvedValue(null)
  })

  it('exposes the select target as a native button with an accessible name', () => {
    const w = mount(AssetCard, { props: { asset } })
    const select = w.get('button.asset-select') // native button => keyboard-operable by contract
    expect(select.attributes('aria-label')).toContain('clip.mp4')
  })

  it('emits select (not delete) when the select button is activated', async () => {
    const w = mount(AssetCard, { props: { asset } })
    await w.get('button.asset-select').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['asset_1'])
    expect(w.emitted('delete')).toBeUndefined()
  })

  it('exposes delete as a named sibling button that emits delete and stops propagation', async () => {
    const w = mount(AssetCard, { props: { asset } })
    const del = w.get('button.delete-btn')
    expect(del.attributes('aria-label')).toContain('clip.mp4')
    await del.trigger('click')
    expect(w.emitted('delete')?.[0]).toEqual(['asset_1'])
    // stopPropagation: deleting must not also select
    expect(w.emitted('select')).toBeUndefined()
  })
})
