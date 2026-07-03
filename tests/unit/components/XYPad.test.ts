import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import XYPad from '@/components/controls/XYPad.vue'

/**
 * XYPad — a reusable 2-axis pad control (Phase 3 bullet 2, Tier B). Pins the seam: the point renders at
 * the normalized modelValue (y up), pointer input emits clamped {x,y}, and a drag ends on mouseup.
 */

/** Give the pad a deterministic box (jsdom returns zeros otherwise, which the widget guards against). */
function mountPad(modelValue: { x: number; y: number }, box = { left: 0, top: 0, width: 100, height: 100 }) {
  const w = mount(XYPad, { props: { modelValue } })
  const pad = w.get('.xy-pad').element as HTMLElement
  Object.defineProperty(pad, 'getBoundingClientRect', {
    value: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top }),
    configurable: true,
  })
  return w
}

describe('XYPad', () => {
  it('renders the point at the normalized modelValue (y inverted so 1 is at the top)', () => {
    const w = mountPad({ x: 0.25, y: 0.75 })
    const style = (w.get('.xy-point').element as HTMLElement).style
    expect(style.left).toBe('25%')
    expect(style.top).toBe('25%') // (1 - 0.75) * 100
  })

  it('mousedown emits update:modelValue with normalized, y-inverted coords', async () => {
    const w = mountPad({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('mousedown', { clientX: 50, clientY: 20 })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([{ x: 0.5, y: 0.8 }]) // y = 1 - 20/100
  })

  it('clamps out-of-bounds pointer positions to 0..1', async () => {
    const w = mountPad({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('mousedown', { clientX: 150, clientY: -10 })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([{ x: 1, y: 1 }])
  })

  it('tracks a window drag after mousedown and stops emitting after mouseup', async () => {
    const w = mountPad({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('mousedown', { clientX: 50, clientY: 50 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 50 }))
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([{ x: 0.3, y: 0.5 }]) // moved from {0.5,0.5}
    const countAtUp = w.emitted('update:modelValue')!.length
    window.dispatchEvent(new MouseEvent('mouseup'))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 90 }))
    expect(w.emitted('update:modelValue')!.length).toBe(countAtUp) // no further emits after mouseup
  })

  it('tears down window listeners on unmount (no leak if unmounted mid-drag)', async () => {
    // Spy on window.removeEventListener. We unmount WITHOUT a mouseup, so the only path that can remove
    // the drag listeners is onUnmounted — deleting that handler leaves `removed` empty and reds this.
    const removed: string[] = []
    const origRemove = window.removeEventListener.bind(window)
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type)
      // @ts-expect-error — spy passthrough
      return origRemove(type, ...rest)
    }) as typeof window.removeEventListener
    try {
      const w = mountPad({ x: 0.5, y: 0.5 })
      await w.get('.xy-pad').trigger('mousedown', { clientX: 50, clientY: 50 }) // start a drag → listeners attached
      w.unmount() // unmount mid-drag, no mouseup
      expect(removed).toContain('mousemove')
      expect(removed).toContain('mouseup')
    } finally {
      window.removeEventListener = origRemove
    }
  })
})

/**
 * XYPad accessibility (Phase 3 bullet 3): a 2D pad has no native ARIA control, so it's a single focusable
 * role="application" host announcing both axes via aria-valuetext, with arrow keys moving the point
 * (y is up) — the SAME atomic {x,y} emit as the drag path (WCAG 2.1.1 keyboard, 2.5.7 drag alternative).
 */
describe('XYPad accessibility', () => {
  const mountKb = (modelValue: { x: number; y: number }, props = {}) =>
    mount(XYPad, { props: { modelValue, ...props } })
  const lastXY = (w: ReturnType<typeof mountKb>) =>
    w.emitted('update:modelValue')?.at(-1)?.[0] as { x: number; y: number } | undefined

  it('is a focusable role=application with an accessible name + both-axis value text', () => {
    const pad = mountKb({ x: 0.25, y: 0.75 }, { label: 'Position' }).get('.xy-pad')
    expect(pad.attributes('role')).toBe('application')
    expect(pad.attributes('tabindex')).toBe('0')
    expect(pad.attributes('aria-label')).toBe('Position (X Y pad)')
    expect(pad.attributes('aria-valuetext')).toBe('X 25%, Y 75%')
  })

  it('falls back to a generic name when no label is given', () => {
    expect(mountKb({ x: 0.5, y: 0.5 }).get('.xy-pad').attributes('aria-label')).toBe('X Y pad')
  })

  it('arrow keys move the point by step (y up), emitting {x,y}', async () => {
    const w = mountKb({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('keydown', { key: 'ArrowRight' })
    expect(lastXY(w)!.x).toBeCloseTo(0.55); expect(lastXY(w)!.y).toBeCloseTo(0.5)
    await w.get('.xy-pad').trigger('keydown', { key: 'ArrowUp' }) // y-up
    expect(lastXY(w)!.y).toBeCloseTo(0.55)
    await w.get('.xy-pad').trigger('keydown', { key: 'ArrowDown' })
    expect(lastXY(w)!.y).toBeCloseTo(0.45)
  })

  it('clamps at the edges and honors Shift for a bigger step', async () => {
    const hi = mountKb({ x: 0.98, y: 0.5 })
    await hi.get('.xy-pad').trigger('keydown', { key: 'ArrowRight' })
    expect(lastXY(hi)!.x).toBe(1) // clamped
    const w = mountKb({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(lastXY(w)!.x).toBeCloseTo(0.7) // BIG_STEP 0.2
  })

  it('Home centers, End jumps to top-right, PageUp coarse-raises y', async () => {
    const w = mountKb({ x: 0.2, y: 0.3 })
    await w.get('.xy-pad').trigger('keydown', { key: 'Home' })
    expect(lastXY(w)).toEqual({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('keydown', { key: 'End' })
    expect(lastXY(w)).toEqual({ x: 1, y: 1 })
    const p = mountKb({ x: 0.5, y: 0.5 })
    await p.get('.xy-pad').trigger('keydown', { key: 'PageUp' })
    expect(lastXY(p)!.y).toBeCloseTo(0.7)
  })

  it('ignores unhandled keys (no emit)', async () => {
    const w = mountKb({ x: 0.5, y: 0.5 })
    await w.get('.xy-pad').trigger('keydown', { key: 'a' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
