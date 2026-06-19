import { describe, it, expect } from 'vitest'
import { categoryMeta, type NodeCategory } from '@/stores/nodes'
import { categoryIcons, fallbackCategoryIcon } from '@/utils/categoryIcons'

/**
 * The palette, node header, and explorer render `categoryIcons[category]`. If a
 * category were missing an icon it would render nothing (or crash on `<component
 * :is>`), so pin that the map covers every category in categoryMeta and that the
 * fallback exists.
 */
describe('categoryIcons', () => {
  it('has a defined icon for every category in categoryMeta', () => {
    for (const key of Object.keys(categoryMeta) as NodeCategory[]) {
      expect(categoryIcons[key], `missing icon for category "${key}"`).toBeDefined()
    }
  })

  it('exposes a fallback icon', () => {
    expect(fallbackCategoryIcon).toBeDefined()
  })
})
