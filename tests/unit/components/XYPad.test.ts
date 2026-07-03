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
