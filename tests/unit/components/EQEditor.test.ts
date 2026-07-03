import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EQEditor from '@/components/controls/EQEditor.vue'

/**
 * EQEditor keyboard a11y (Phase 3 bullet 3). The `ui` migration replaced parametric-eq's panel number
 * inputs with this pointer-only canvas, removing keyboard access (WCAG 2.1.1). Restored like
 * EnvelopeEditor: one focusable role="application" host cycling the 9 band×param targets (Left/Right) and
 * adjusting the selected one (Up/Down/Home/End), announced via aria-valuetext. Emits the same EQData.
 */
const bands = () => ({
  bands: [
    { frequency: 200, gain: 0, q: 1 },
    { frequency: 1000, gain: 0, q: 1 },
    { frequency: 5000, gain: 0, q: 1 },
  ],
})
const mountEq = (modelValue = bands()) => mount(EQEditor, { props: { modelValue } })
const pad = (w: ReturnType<typeof mountEq>) => w.get('[role="application"]')
const lastBands = (w: ReturnType<typeof mountEq>) =>
  (w.emitted('update:modelValue')?.at(-1)?.[0] as ReturnType<typeof bands> | undefined)?.bands

describe('EQEditor keyboard accessibility', () => {
  it('is a focusable role=application announcing the selected band×param', () => {
    const p = pad(mountEq())
    expect(p.attributes('role')).toBe('application')
    expect(p.attributes('tabindex')).toBe('0')
    expect(p.attributes('aria-label')).toBe('Equalizer')
    expect(p.attributes('aria-roledescription')).toBe('parametric EQ')
    expect(p.attributes('aria-valuetext')).toBe('Band 1 200 Hz') // target 0 = band 0 frequency
  })

  it('Left/Right cycle through the 9 band×param targets', async () => {
    const w = mountEq()
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('Band 1 0.0 dB') // band 0 gain
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('Band 1 Q 1.0') // band 0 q
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('Band 2 1000 Hz') // band 1 frequency
    await pad(w).trigger('keydown', { key: 'ArrowLeft' })
    expect(pad(w).attributes('aria-valuetext')).toBe('Band 1 Q 1.0') // wraps back
  })

  it('Up/Down adjust the selected param (freq log-step, gain ±1dB, q ±0.1)', async () => {
    const w = mountEq()
    await pad(w).trigger('keydown', { key: 'ArrowUp' }) // band0 freq 200 * 1.1
    expect(lastBands(w)![0].frequency).toBe(220)
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // → band0 gain
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastBands(w)![0].gain).toBe(1)
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // → band0 q
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastBands(w)![0].q).toBeCloseTo(1.1)
  })

  it('adjusts the correct band after cycling to band 2', async () => {
    const w = mountEq()
    for (let i = 0; i < 3; i++) await pad(w).trigger('keydown', { key: 'ArrowRight' }) // → band1 freq
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastBands(w)![1].frequency).toBe(1100) // 1000 * 1.1
    expect(lastBands(w)![0].frequency).toBe(200) // band 0 unchanged
  })

  it('Home/End set the selected param to its min/max', async () => {
    const w = mountEq()
    await pad(w).trigger('keydown', { key: 'End' }) // freq max
    expect(lastBands(w)![0].frequency).toBe(20000)
    await pad(w).trigger('keydown', { key: 'Home' }) // freq min
    expect(lastBands(w)![0].frequency).toBe(20)
  })

  it('clamps gain and ignores unhandled keys', async () => {
    const w = mountEq({ bands: [{ frequency: 200, gain: 24, q: 1 }, { frequency: 1000, gain: 0, q: 1 }, { frequency: 5000, gain: 0, q: 1 }] })
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // band0 gain (already at max 24)
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastBands(w)![0].gain).toBe(24) // clamped
    const before = w.emitted('update:modelValue')?.length ?? 0
    await pad(w).trigger('keydown', { key: 'z' })
    expect(w.emitted('update:modelValue')?.length ?? 0).toBe(before)
  })
})
