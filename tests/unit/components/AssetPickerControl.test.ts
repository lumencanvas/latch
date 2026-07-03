import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useAssetsStore } from '@/stores/assets'
import AssetPickerControl from '@/components/controls/AssetPickerControl.vue'

/**
 * AssetPickerControl keyboard a11y (WCAG 2.1.1). The opener used to be a mouse-only <div>, so keyboard
 * users could never open the picker (and thus never reach the dropdown's buttons). It is now a real
 * <button> (Tab-reachable, Enter/Space-activatable) with aria-expanded/haspopup, and the clear control is
 * a sibling button rather than a nested descendant.
 */
describe('AssetPickerControl keyboard accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useAssetsStore()
    // Avoid IndexedDB in the unit env (onMounted loads assets / thumbnails).
    store.loadAssets = vi.fn().mockResolvedValue(undefined)
    store.getThumbnailUrl = vi.fn().mockResolvedValue(null)
  })

  it('the opener is a native button with aria-expanded/haspopup that toggles the picker', async () => {
    const w = mount(AssetPickerControl, { props: { modelValue: null, assetType: 'all' } })
    const opener = w.get('button.asset-open') // a <button> is inherently keyboard-operable (Tab + Enter/Space)
    expect(opener.attributes('aria-haspopup')).toBe('true')
    expect(opener.attributes('aria-expanded')).toBe('false')
    expect(w.find('.picker-dropdown').exists()).toBe(false)
    await opener.trigger('click') // Enter/Space on a native button dispatch a click
    expect(opener.attributes('aria-expanded')).toBe('true')
    expect(w.find('.picker-dropdown').exists()).toBe(true)
  })

  it('the opener carries an accessible name even when empty', () => {
    const w = mount(AssetPickerControl, { props: { modelValue: null, assetType: 'all' } })
    expect(w.get('button.asset-open').attributes('aria-label')).toBe('Select asset')
  })
})
