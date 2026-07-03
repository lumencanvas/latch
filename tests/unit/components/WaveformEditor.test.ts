import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WaveformEditor from '@/components/controls/WaveformEditor.vue'

/**
 * WaveformEditor keyboard a11y (Phase 3 bullet 3 — the last pointer-only canvas editor). Freehand drawing
 * is inherently pointer-driven, but the editor must still be keyboard-OPERABLE (WCAG 2.1.1) like the other
 * canvas editors. Same role="application" + selected-target idiom, adapted to a long sample sequence:
 * Left/Right move the selected sample, PageUp/Down jump ±8, Home/End first/last (horizontal = index);
 * Up/Down adjust that sample's value ±0.05 (Shift = coarse), clamped -1..1. Emits the SAME
 * { samples, preset:'custom' } as the drag. (The 4 preset buttons were already keyboard-accessible.)
 */
const N = 64
const zeros = () => ({ samples: Array.from({ length: N }, () => 0), preset: 'custom' as const })
const mountEd = (modelValue = zeros()) => mount(WaveformEditor, { props: { modelValue } })
const pad = (w: ReturnType<typeof mountEd>) => w.get('[role="application"]')
const lastWave = (w: ReturnType<typeof mountEd>) =>
  w.emitted('update:modelValue')?.at(-1)?.[0] as { samples: number[]; preset?: string } | undefined

describe('WaveformEditor keyboard accessibility', () => {
  it('is a focusable role=application announcing the selected sample + value', () => {
    const p = pad(mountEd())
    expect(p.attributes('role')).toBe('application')
    expect(p.attributes('tabindex')).toBe('0')
    expect(p.attributes('aria-label')).toBe('Waveform')
    expect(p.attributes('aria-roledescription')).toBe('waveform')
    expect(p.attributes('aria-valuetext')).toBe('sample 1/64: 0.00') // default selection
  })

  it('Left/Right move the selected sample (reflected in aria-valuetext)', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowRight' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 2/64: 0.00')
    await pad(w).trigger('keydown', { key: 'ArrowLeft' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 1/64: 0.00')
    // clamps at the low end
    await pad(w).trigger('keydown', { key: 'ArrowLeft' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 1/64: 0.00')
  })

  it('Up/Down adjust the selected sample value, emitting { samples, preset:custom }', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastWave(w)!.samples[0]).toBeCloseTo(0.05)
    expect(lastWave(w)!.preset).toBe('custom')
    expect(lastWave(w)!.samples[1]).toBe(0) // others untouched
    await pad(w).trigger('keydown', { key: 'ArrowDown' })
    expect(lastWave(w)!.samples[0]).toBeCloseTo(-0.05) // from unchanged prop (0)
  })

  it('Shift makes a coarse value step', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(lastWave(w)!.samples[0]).toBeCloseTo(0.2)
  })

  it('adjusts the correct sample after moving the selection', async () => {
    const w = mountEd()
    await pad(w).trigger('keydown', { key: 'ArrowRight' }) // select sample 2 (index 1)
    await pad(w).trigger('keydown', { key: 'ArrowUp' })
    expect(lastWave(w)!.samples[1]).toBeCloseTo(0.05)
    expect(lastWave(w)!.samples[0]).toBe(0)
  })

  it('PageUp/Down jump the selection by 8, Home/End go to first/last — and navigation never emits', async () => {
    const w = mountEd()
    // Navigation keys only move the selection; they must NOT emit update:modelValue (no sample changes).
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End']) {
      await pad(w).trigger('keydown', { key })
    }
    expect(w.emitted('update:modelValue')).toBeUndefined()
    await pad(w).trigger('keydown', { key: 'Home' }) // reset to sample 1 for the positional checks below
    await pad(w).trigger('keydown', { key: 'PageDown' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 9/64: 0.00')
    await pad(w).trigger('keydown', { key: 'End' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 64/64: 0.00')
    await pad(w).trigger('keydown', { key: 'PageUp' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 56/64: 0.00')
    await pad(w).trigger('keydown', { key: 'Home' })
    expect(pad(w).attributes('aria-valuetext')).toBe('sample 1/64: 0.00')
  })

  it('clamps the value at +/-1 and ignores unhandled keys', async () => {
    const w = mountEd({ samples: Array.from({ length: N }, (_, i) => (i === 0 ? 0.98 : 0)), preset: 'custom' })
    await pad(w).trigger('keydown', { key: 'ArrowUp' }) // 0.98 + 0.05 → clamp 1
    expect(lastWave(w)!.samples[0]).toBe(1)
    const before = w.emitted('update:modelValue')?.length ?? 0
    await pad(w).trigger('keydown', { key: 'z' })
    expect(w.emitted('update:modelValue')?.length ?? 0).toBe(before)
  })
})
