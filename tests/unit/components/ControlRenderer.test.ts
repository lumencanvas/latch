import { describe, it, expect, vi } from 'vitest'
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

  it('select: emits the chosen option value on change', async () => {
    const w = render({ id: 'sel', type: 'select', props: { options: ['a', 'b'] } }, 'a')
    await w.get('select').setValue('b')
    expect(w.emitted('update')?.at(-1)).toEqual(['b'])
  })

  it('canvas: tags each widget with the ctx-canvas class', () => {
    const w = render({ id: 's', type: 'slider', props: {} }, 1)
    expect(w.get('.control-slider').classes()).toContain('ctx-canvas')
  })
})

/**
 * Panel context (Properties panel host). Same widgets + coercions as canvas, but two
 * behavioral forks: no @mousedown.stop guard (the panel isn't a draggable node) and no
 * ON/OFF caption on the toggle. Styling is context-scoped, guarded by the ctx-panel class.
 */
describe('ControlRenderer — panel context', () => {
  const renderPanel = (control: Record<string, unknown>, modelValue: unknown) =>
    mount(ControlRenderer, { props: { control, modelValue, context: 'panel' } })

  it('tags each widget with the ctx-panel class', () => {
    const w = renderPanel({ id: 's', type: 'slider', props: {} }, 1)
    expect(w.get('.control-slider').classes()).toContain('ctx-panel')
  })

  it('toggle: omits the ON/OFF caption but still emits boolean', async () => {
    const w = renderPanel({ id: 't', type: 'toggle' }, true)
    expect(w.text()).not.toContain('ON')
    expect(w.text()).not.toContain('OFF')
    const cb = w.get('input[type="checkbox"]')
    expect((cb.element as HTMLInputElement).checked).toBe(true)
    await cb.setValue(false)
    expect(w.emitted('update')?.at(-1)).toEqual([false])
  })

  it('number: clamps on blur identically to canvas', async () => {
    const w = renderPanel({ id: 'n', type: 'number', props: { min: 0, max: 10 } }, 5)
    const input = w.get('input[type="number"]')
    ;(input.element as HTMLInputElement).value = '99'
    await input.trigger('blur')
    expect(w.emitted('update')?.at(-1)).toEqual([10])
  })
})

/**
 * The @mousedown fork is the headline canvas-vs-panel behavioral difference: on-canvas widgets
 * stop mousedown from reaching Vue Flow's node-drag handler (so dragging a slider doesn't drag the
 * node); the panel host isn't draggable and must let it through. Dispatch a bubbling mousedown from
 * a widget and assert whether it reaches a parent listener.
 */
describe('ControlRenderer — mousedown drag guard', () => {
  const mountInParent = (context: string) => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const parentSaw = vi.fn()
    parent.addEventListener('mousedown', parentSaw)
    const w = mount(ControlRenderer, {
      props: { control: { id: 's', type: 'slider', props: {} }, modelValue: 1, context },
      attachTo: parent,
    })
    w.get('input[type="range"]').element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    const calls = parentSaw.mock.calls.length
    w.unmount()
    parent.remove()
    return calls
  }

  it('canvas: stops propagation so the node does not drag', () => {
    expect(mountInParent('canvas')).toBe(0)
  })

  it('panel: lets propagation through (no drag guard)', () => {
    expect(mountInParent('panel')).toBe(1)
  })
})
