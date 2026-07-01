import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'

/**
 * ControlRenderer is the shared per-type widget (Phase 3, extracted from BaseNode).
 * These pin the type→widget dispatch + the behavioral coercions (parse/clamp/boolean),
 * so a future refactor toward the panel/config contexts can't silently drift them.
 */
const render = (control: Record<string, unknown>, modelValue: unknown) =>
  mount(ControlRenderer, { props: { control, modelValue, context: 'canvas' } })

describe('ControlRenderer', () => {
  it('slider: range input with min/max/step, emits parsed float', async () => {
    const w = render({ id: 's', type: 'slider', props: { min: 0, max: 10, step: 0.5 } }, 3)
    const input = w.get('input[type="range"]')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('10')
    expect(input.attributes('step')).toBe('0.5')
    await input.setValue('4.5')
    expect(w.emitted('update')?.at(-1)).toEqual([4.5])
  })

  it('toggle: checkbox with ON/OFF text, emits boolean', async () => {
    const w = render({ id: 't', type: 'toggle' }, true)
    expect(w.text()).toContain('ON')
    const cb = w.get('input[type="checkbox"]')
    expect((cb.element as HTMLInputElement).checked).toBe(true)
    await cb.setValue(false)
    expect(w.emitted('update')?.at(-1)).toEqual([false])
  })

  it('number: binds min/max, emits parseFloat||0 on input, clamps on blur', async () => {
    const w = render({ id: 'n', type: 'number', props: { min: 0, max: 10 } }, 5)
    const input = w.get('input[type="number"]')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('10')
    ;(input.element as HTMLInputElement).value = '' // empty → parseFloat('')||0 = 0
    await input.trigger('input')
    expect(w.emitted('update')?.at(-1)).toEqual([0])
    ;(input.element as HTMLInputElement).value = '99'
    await input.trigger('blur') // clamps to max
    expect(w.emitted('update')?.at(-1)).toEqual([10])
  })

  it('text: placeholder + emits string', async () => {
    const w = render({ id: 'x', type: 'text', props: { placeholder: 'hi' } }, 'abc')
    const input = w.get('input[type="text"]')
    expect(input.attributes('placeholder')).toBe('hi')
    await input.setValue('yo')
    expect(w.emitted('update')?.at(-1)).toEqual(['yo'])
  })

  it('color: defaults to #808080 when empty, shows the value', () => {
    const w = render({ id: 'c', type: 'color' }, undefined)
    expect((w.get('input[type="color"]').element as HTMLInputElement).value).toBe('#808080')
  })

  it('select: renders string options', () => {
    const w = render({ id: 'sel', type: 'select', props: { options: ['a', 'b'] } }, 'a')
    const opts = w.findAll('option')
    expect(opts.map((o) => o.attributes('value'))).toEqual(['a', 'b'])
  })
})
