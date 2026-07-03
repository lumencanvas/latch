import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'

/**
 * RotaryKnob accessibility (Phase 3 bullet 3): the canvas knob is a custom control, so it needs the ARIA
 * slider pattern + a keyboard path (WCAG 2.1.1 keyboard, 2.5.7 drag alternative, 4.1.2 name/role/value).
 * Keyboard emits the SAME `update:modelValue` (number) as the drag/wheel path, with the same snap+clamp.
 */
const mountKnob = (props = {}) =>
  mount(RotaryKnob, { props: { modelValue: 0.5, min: 0, max: 1, step: 0.01, ...props } })

const knobOf = (w: ReturnType<typeof mountKnob>) => w.get('[role="slider"]')
const lastEmit = (w: ReturnType<typeof mountKnob>) =>
  (w.emitted('update:modelValue')?.at(-1) as number[] | undefined)?.[0]

describe('RotaryKnob accessibility', () => {
  it('exposes the ARIA slider role + value/bounds + focusability', () => {
    const knob = knobOf(mountKnob())
    expect(knob.attributes('role')).toBe('slider')
    expect(knob.attributes('tabindex')).toBe('0')
    expect(knob.attributes('aria-valuemin')).toBe('0')
    expect(knob.attributes('aria-valuemax')).toBe('1')
    expect(knob.attributes('aria-valuenow')).toBe('0.5')
    expect(knob.attributes('aria-valuetext')).toBe('0.50') // default valueFormat
  })

  it('aria-valuenow tracks modelValue', async () => {
    const w = mountKnob()
    await w.setProps({ modelValue: 0.7 })
    expect(knobOf(w).attributes('aria-valuenow')).toBe('0.7')
  })

  it('names itself from the label prop, falling back to "Value"', () => {
    expect(knobOf(mountKnob({ label: 'Cutoff' })).attributes('aria-label')).toBe('Cutoff')
    expect(knobOf(mountKnob()).attributes('aria-label')).toBe('Value')
  })

  it('ArrowUp/Right increment and ArrowDown/Left decrement by step', async () => {
    const w = mountKnob()
    await knobOf(w).trigger('keydown', { key: 'ArrowRight' })
    expect(lastEmit(w)).toBeCloseTo(0.51)
    await knobOf(w).trigger('keydown', { key: 'ArrowDown' })
    expect(lastEmit(w)).toBeCloseTo(0.49)
  })

  it('Home jumps to min, End to max, PageUp uses the coarse step', async () => {
    const w = mountKnob()
    await knobOf(w).trigger('keydown', { key: 'Home' })
    expect(lastEmit(w)).toBe(0)
    await knobOf(w).trigger('keydown', { key: 'End' })
    expect(lastEmit(w)).toBe(1)
    await knobOf(w).trigger('keydown', { key: 'PageUp' })
    expect(lastEmit(w)).toBeCloseTo(0.6) // step * 10
  })

  it('clamps at the bounds and respects a non-default step', async () => {
    const hi = mountKnob({ modelValue: 1 })
    await knobOf(hi).trigger('keydown', { key: 'ArrowRight' })
    expect(lastEmit(hi)).toBe(1)
    const coarse = mountKnob({ modelValue: 0.5, step: 0.1 })
    await knobOf(coarse).trigger('keydown', { key: 'ArrowRight' })
    expect(lastEmit(coarse)).toBeCloseTo(0.6)
  })

  it('ignores unhandled keys (no emit, no throw)', async () => {
    const w = mountKnob()
    await knobOf(w).trigger('keydown', { key: 'a' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
