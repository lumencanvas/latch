import { describe, it, expect } from 'vitest'
import {
  collectCategories,
  applyDiscoveredCategories,
  discoveredCategories,
} from '@/registry/categoryRegistry'
import { defineCategory, type CategorySpec } from '@/engine/defineCategory'
import { getCategoryIcon, fallbackCategoryIcon } from '@/utils/categoryIcons'
import { categoryMeta, type CategoryMeta } from '@/stores/nodes'
import { h } from 'vue'
// Importing the registry assembler runs the boot-time merge (`applyDiscoveredCategories(categoryMeta,
// discoveredCategories)` in allNodes.ts). No `registry/**/category.ts` ships yet, so `discoveredCategories`
// is empty and that call is currently a no-op — the "live wiring" block below asserts the merge target is
// the real, mutable `categoryMeta` so a shipped drop-in would actually reach the palette.
import '@/registry/allNodes'

/**
 * Drop-in categories (Workstream A5): a whole category is added by dropping a
 * `registry/<cat>/category.ts` (`defineCategory({...})`) — the `categoryRegistry`
 * glob discovers it and `allNodes` merges its metadata into `categoryMeta` with
 * ZERO edits to the core store. This pins the collector guards + the merge contract
 * (built-ins win, drop-ins are additive) with fixtures, plus the live wiring.
 */

const cat = (id: string, over: Partial<CategorySpec> = {}): CategorySpec =>
  defineCategory({ id, label: id.toUpperCase(), icon: 'star', color: '#abcabc', ...over })

describe('defineCategory', () => {
  it('returns the spec (identity brand)', () => {
    const spec = cat('demo')
    expect(spec).toEqual({ id: 'demo', label: 'DEMO', icon: 'star', color: '#abcabc' })
  })
})

describe('collectCategories — glob default validation', () => {
  it('registers a valid category.ts default', () => {
    const { categoriesById, duplicateIds, invalid } = collectCategories({
      './demo/category.ts': cat('demo'),
    })
    expect(Object.keys(categoriesById)).toEqual(['demo'])
    expect(duplicateIds).toEqual([])
    expect(invalid).toEqual([])
  })

  it('flags a missing default and a malformed spec (non-string fields)', () => {
    const bad = { id: 'x', label: 'X', icon: 'star' } as unknown as CategorySpec // no color
    const { invalid, categoriesById } = collectCategories({
      './named-only/category.ts': undefined,
      './malformed/category.ts': bad,
    })
    expect(invalid.sort()).toEqual(['./malformed/category.ts', './named-only/category.ts'])
    expect(Object.keys(categoriesById)).toEqual([])
  })

  it('detects a duplicate id across two category.ts files', () => {
    const { duplicateIds } = collectCategories({
      './a/category.ts': cat('dup'),
      './b/category.ts': cat('dup'),
    })
    expect(duplicateIds).toEqual(['dup'])
  })

  it('treats a clash with a known (built-in) id as a duplicate — no shadowing', () => {
    const { duplicateIds, categoriesById } = collectCategories(
      { './shadow/category.ts': cat('audio') },
      ['audio', 'math'],
    )
    expect(duplicateIds).toEqual(['audio'])
    expect(Object.keys(categoriesById)).toEqual([])
  })
})

describe('applyDiscoveredCategories — merge contract', () => {
  it('adds a drop-in category to the target and reports it', () => {
    const target: Record<string, CategoryMeta> = { audio: { label: 'Audio', icon: 'music', color: '#22C55E' } }
    const added = applyDiscoveredCategories(target, { fx: cat('fx', { label: 'FX', color: '#123123' }) })
    expect(added).toEqual(['fx'])
    expect(target.fx).toEqual({ label: 'FX', icon: 'star', color: '#123123' })
  })

  it('never overrides an existing (built-in) id', () => {
    const audio: CategoryMeta = { label: 'Audio', icon: 'music', color: '#22C55E' }
    const target: Record<string, CategoryMeta> = { audio }
    const added = applyDiscoveredCategories(target, { audio: cat('audio', { label: 'HIJACK', color: '#000' }) })
    expect(added).toEqual([])
    expect(target.audio).toBe(audio) // untouched reference
  })
})

describe('live wiring', () => {
  it('keeps all built-in categories after the boot-time merge', () => {
    for (const id of ['debug', 'math', 'audio', 'ai', 'visual', 'custom']) {
      expect(categoryMeta[id], `missing built-in category "${id}"`).toBeDefined()
    }
  })

  it('every discovered drop-in category is present in categoryMeta (empty until a category.ts ships)', () => {
    for (const [id, spec] of Object.entries(discoveredCategories)) {
      expect(categoryMeta[id]).toMatchObject({ label: spec.label, color: spec.color })
    }
  })

  it('a discovered category would reach the palette — the merge target IS the live categoryMeta', () => {
    // Proves the production merge (allNodes → applyDiscoveredCategories) writes into the SAME
    // `categoryMeta` the UI reads, so a shipped `category.ts` flows through end-to-end. (No live
    // drop-in exists yet, so we drive the real merge fn against the real store object directly.)
    const DemoIcon = { name: 'DemoIcon', render: () => h('svg') }
    const added = applyDiscoveredCategories(categoryMeta, {
      'e2e-demo': defineCategory({ id: 'e2e-demo', label: 'E2E', icon: DemoIcon, color: '#0f0' }),
    })
    try {
      expect(added).toEqual(['e2e-demo'])
      expect(categoryMeta['e2e-demo']).toMatchObject({ label: 'E2E', color: '#0f0' })
      expect(getCategoryIcon('e2e-demo')).toBe(DemoIcon) // resolves for the palette
    } finally {
      delete categoryMeta['e2e-demo'] // don't leak into other suites sharing the module
    }
  })
})

describe('getCategoryIcon — drop-in icon resolution', () => {
  const DemoIcon = { name: 'DemoIcon', render: () => h('svg') }

  it('renders a drop-in category component icon carried on categoryMeta', () => {
    categoryMeta['dropin-with-icon'] = { label: 'X', icon: DemoIcon, color: '#111' }
    expect(getCategoryIcon('dropin-with-icon')).toBe(DemoIcon)
    delete categoryMeta['dropin-with-icon']
  })

  it('falls back for a string-only (metadata) icon or an unknown category', () => {
    categoryMeta['dropin-string-icon'] = { label: 'Y', icon: 'sparkles', color: '#222' }
    expect(getCategoryIcon('dropin-string-icon')).toBe(fallbackCategoryIcon)
    expect(getCategoryIcon('totally-unknown')).toBe(fallbackCategoryIcon)
    delete categoryMeta['dropin-string-icon']
  })

  it('still resolves built-in categories to their lucide component', () => {
    expect(getCategoryIcon('math')).toBeDefined()
    expect(getCategoryIcon('math')).not.toBe(fallbackCategoryIcon)
  })
})
