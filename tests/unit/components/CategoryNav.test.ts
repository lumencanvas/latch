import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CategoryNav from '@/components/node-explorer/CategoryNav.vue'
import type { NodeCategory } from '@/stores/nodes'

/**
 * CategoryNav selected state (WCAG 4.1.2). The active category was conveyed only
 * by a CSS class, invisible to assistive tech. Each filter button now exposes
 * aria-pressed reflecting whether it is the current filter.
 */
describe('CategoryNav selected state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('marks the All button pressed when no category is selected', () => {
    const w = mount(CategoryNav, { props: { selectedCategory: null } })
    expect(w.get('button.cat-item').attributes('aria-pressed')).toBe('true')
  })

  it('marks the All button not pressed when a category is selected', () => {
    const w = mount(CategoryNav, { props: { selectedCategory: 'math' as NodeCategory } })
    expect(w.get('button.cat-item').attributes('aria-pressed')).toBe('false')
  })
})
