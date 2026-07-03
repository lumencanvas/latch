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

describe('ControlRenderer accessibility', () => {
  // The visible label in BaseNode/PropertiesPanel is adjacent text, not programmatically associated,
  // so each native input needs its own accessible name (WCAG 4.1.2) from control.label.
  it.each([
    ['slider', 'input[type="range"]', 0.5],
    ['toggle', 'input[type="checkbox"]', true],
    ['select', 'select', 'a'],
    ['number', 'input[type="number"]', 5],
    ['text', 'input[type="text"]', 'hi'],
    ['color', 'input[type="color"]', '#ffffff'],
  ])('%s input names itself from control.label (aria-label)', (type, sel, value) => {
    const control: Record<string, unknown> = { id: 'c', type, label: 'Cutoff' }
    if (type === 'select') control.props = { options: ['a', 'b'] }
    const w = render(control, value)
    expect(w.get(sel).attributes('aria-label')).toBe('Cutoff')
  })
})

describe('ControlRenderer number drag-to-scrub', () => {
  // Simulate a mousedown on the input then a window drag; the handler adds window mousemove/mouseup.
  const drag = async (w: ReturnType<typeof render>, fromX: number, toX: number, opts: MouseEventInit = {}) => {
    await w.get('input[type="number"]').trigger('mousedown', { clientX: fromX })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, ...opts }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: toX })) // complete the gesture → releases listeners
  }
  const lastVal = (w: ReturnType<typeof render>) => w.emitted('update')?.at(-1)?.[0] as number | undefined

  it('a plain click (no horizontal travel) does NOT scrub — click-to-edit is preserved', async () => {
    const w = render({ id: 'n', type: 'number', props: { min: 0, max: 10 } }, 5)
    await w.get('input[type="number"]').trigger('mousedown', { clientX: 100 })
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 }))
    expect(w.emitted('update')).toBeUndefined()
  })

  it('a sub-threshold move (<4px) does not scrub', async () => {
    const w = render({ id: 'n', type: 'number', props: { min: 0, max: 10 } }, 5)
    await drag(w, 100, 102) // 2px
    expect(w.emitted('update')).toBeUndefined()
  })

  it('a drag past the threshold scrubs, mapping dx→value from the mousedown value', async () => {
    const w = render({ id: 'n', type: 'number', props: { min: 0, max: 10, step: 1 } }, 5)
    await drag(w, 100, 140) // dx 40 · sensitivity (10-0)/200 = 0.05 → +2 → 7
    expect(lastVal(w)).toBe(7)
  })

  it('clamps ONLY against declared finite bounds (never exceeds max)', async () => {
    const w = render({ id: 'n', type: 'number', props: { min: 0, max: 10, step: 1 } }, 5)
    await drag(w, 100, 500) // huge dx → would be 25, clamped to max 10
    expect(lastVal(w)).toBe(10)
  })

  it('an UNBOUNDED control (no min/max) scrubs by step, never NaN, never clamped', async () => {
    const w = render({ id: 'n', type: 'number' }, 5) // no props → step defaults to 1, unbounded
    await drag(w, 100, 140) // dx 40 · sensitivity step/4 = 0.25 → +10 → 15
    expect(lastVal(w)).toBe(15)
    expect(Number.isNaN(lastVal(w))).toBe(false)
  })

  it('Shift makes the scrub finer', async () => {
    const coarse = render({ id: 'n', type: 'number', props: { min: 0, max: 10, step: 0.1 } }, 5)
    await drag(coarse, 100, 140) // +2 → 7
    const fine = render({ id: 'n', type: 'number', props: { min: 0, max: 10, step: 0.1 } }, 5)
    await drag(fine, 100, 140, { shiftKey: true }) // +2*0.25 = +0.5 → 5.5
    expect(Math.abs(lastVal(fine)! - 5)).toBeLessThan(Math.abs(lastVal(coarse)! - 5))
  })

  it('tears down window listeners if unmounted mid-scrub (no leak across ~566 instances)', async () => {
    const removed: string[] = []
    const orig = window.removeEventListener.bind(window)
    window.removeEventListener = ((t: string, ...rest: unknown[]) => {
      removed.push(t); return (orig as (...a: unknown[]) => void)(t, ...rest)
    }) as typeof window.removeEventListener
    try {
      const w = render({ id: 'n', type: 'number' }, 5)
      await w.get('input[type="number"]').trigger('mousedown', { clientX: 100 }) // arm
      w.unmount()
      expect(removed).toContain('mousemove')
      expect(removed).toContain('mouseup')
    } finally {
      window.removeEventListener = orig
    }
  })
})
