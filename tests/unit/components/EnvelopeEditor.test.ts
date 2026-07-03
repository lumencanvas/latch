import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EnvelopeEditor from '@/components/controls/EnvelopeEditor.vue'

/**
 * EnvelopeEditor keyboard a11y (Phase 3 bullet 3). The `ui` migration replaced the panel's ADSR number
 * inputs with this canvas editor, removing keyboard editability — restored here (WCAG 2.1.1 / 4.1.2) with
 * the XYPad pattern: one focusable role="application" host, arrow keys cycle the selected stage (Left/Right)
 * and adjust it (Up/Down/Home/End), announced via aria-valuetext. Emits the SAME EnvelopeData as the drag.
 */
const ADSR = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 }
const mountEd = (modelValue = ADSR) => mount(EnvelopeEditor, { props: { modelValue } })
const pad = (w: ReturnType<typeof mountEd>) => w.get('[role="application"]')
const lastEnv = (w: ReturnType<typeof mountEd>) =>
  w.emitted('update:modelValue')?.at(-1)?.[0] as typeof ADSR | undefined

describe('EnvelopeEditor keyboard accessibility', () => {
  it('is a focusable role=application announcing the selected stage + value', () => {
    const p = pad(mountEd())
    expect(p.attributes('role')).toBe('application')
    expect(p.attributes('tabindex')).toBe('0')
    expect(p.attributes('aria-label')).toBe('Envelope')
    expect(p.attributes('aria-roledescription')).toBe('ADSR envelope')
    expect(p.attributes('aria-valuetext')).toBe('attack 0.10s') // default selected stage
  })

  it('Left/Right cycle the selected stage (reflected in aria-valuetext)', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('decay 0.20s')
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sustain 50%')
    await pad(w).trigger('keydown', { key: 'ArrowLeft' }) // back to decay
    expect(pad(w).attributes('aria-valuetext')).toBe('decay 0.20s')
  })

  it('Up/Down adjust the selected stage by its step, emitting the full EnvelopeData', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowUp' }) // attack 0.1 + 0.05
    expect(lastEnv(w)!.attack).toBeCloseTo(0.15)
    expect(lastEnv(w)!.decay).toBe(0.2) // others unchanged
    await pad(w).trigger('keydown', { key: 'ArrowDown' })
    // selection is still attack; adjust from the (unchanged in test) prop 0.1 → 0.05
    expect(lastEnv(w)!.attack).toBeCloseTo(0.05)
  })

  it('adjusts the correct stage after switching selection', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // select decay
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastEnv(w)!.decay).toBeCloseTo(0.25)
    expect(lastEnv(w)!.attack).toBe(0.1)
  })

  it('Home/End set the selected stage to its min/max', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'End' }) // attack max = 2
    expect(lastEnv(w)!.attack).toBe(2)
    await pad(w).trigger('keydown', { key: 'Home' }) // attack min = 0.001
    expect(lastEnv(w)!.attack).toBe(0.001)
  })

  it('clamps within the stage range and ignores unhandled keys', async () => {
    const w = mountEd({ ...ADSR, sustain: 0.98 })
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // decay
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // sustain
    await pad(w).trigger('keydown', { key: 'ArrowUp' }) // 0.98 + 0.05 → clamp 1
    expect(lastEnv(w)!.sustain).toBe(1)
    const before = w.emitted('update:modelValue')?.length ?? 0
    await pad(w).trigger('keydown', { key: 'x' })
    expect(w.emitted('update:modelValue')?.length ?? 0).toBe(before)
  })
})
