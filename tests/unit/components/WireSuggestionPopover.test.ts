import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WireSuggestionPopover from '@/components/canvas/WireSuggestionPopover.vue'

const items = [
  { nodeType: 'reverb', name: 'Reverb', color: '#22C55E', port: { id: 'in', type: 'audio' as const } },
  { nodeType: 'gain', name: 'Gain', color: '#22C55E', port: { id: 'sig', type: 'audio' as const } },
  { nodeType: 'delay', name: 'Delay', color: '#22C55E', port: { id: 'in', type: 'audio' as const } },
]

const mountIt = (overrides = {}) =>
  mount(WireSuggestionPopover, {
    props: { items, x: 100, y: 100, originTypeLabel: 'Audio', originGlyph: '~', originColor: '#22C55E', ...overrides },
  })

describe('WireSuggestionPopover', () => {
  it('renders each suggestion as a role=option', () => {
    const w = mountIt()
    expect(w.findAll('[role="option"]')).toHaveLength(3)
    expect(w.get('input[role="combobox"]').attributes('aria-label')).toBe('Search nodes that accept Audio')
  })

  it('filters options as you type in the combobox', async () => {
    const w = mountIt()
    await w.get('input[role="combobox"]').setValue('rev')
    const opts = w.findAll('[role="option"]')
    expect(opts).toHaveLength(1)
    expect(opts[0].text()).toContain('Reverb')
  })

  it('tracks the active option via aria-activedescendant; ArrowDown advances (and wraps)', async () => {
    const w = mountIt()
    const input = w.get('input[role="combobox"]')
    expect(input.attributes('aria-activedescendant')).toBe('wire-sugg-opt-reverb')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toBe('wire-sugg-opt-gain')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' }) // past the end → wraps to first
    expect(input.attributes('aria-activedescendant')).toBe('wire-sugg-opt-reverb')
    await input.trigger('keydown', { key: 'ArrowUp' }) // wraps back to last
    expect(input.attributes('aria-activedescendant')).toBe('wire-sugg-opt-delay')
  })

  it('Enter picks the active option (not just the first)', async () => {
    const w = mountIt()
    const input = w.get('input[role="combobox"]')
    await input.trigger('keydown', { key: 'ArrowDown' }) // active → gain
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('pick')?.[0]?.[0]).toMatchObject({ nodeType: 'gain', port: { id: 'sig' } })
  })

  it('clicking an option picks it', async () => {
    const w = mountIt()
    await w.findAll('[role="option"]')[2].trigger('click')
    expect(w.emitted('pick')?.[0]?.[0]).toMatchObject({ nodeType: 'delay' })
  })

  it('Escape emits close', async () => {
    const w = mountIt()
    await w.get('input[role="combobox"]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toBeTruthy()
  })

  it('resets the active option to the top after the filter changes', async () => {
    const w = mountIt()
    const input = w.get('input[role="combobox"]')
    await input.trigger('keydown', { key: 'ArrowDown' }) // active → gain (index 1)
    await input.setValue('delay') // list is now just Delay → active must snap back to it
    expect(input.attributes('aria-activedescendant')).toBe('wire-sugg-opt-delay')
  })

  it('shows an empty message when nothing matches', async () => {
    const w = mountIt()
    await w.get('input[role="combobox"]').setValue('zzzznomatch')
    expect(w.findAll('[role="option"]')).toHaveLength(0)
    expect(w.text()).toContain('No compatible nodes')
  })
})
