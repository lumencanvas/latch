import { describe, it, expect } from 'vitest'
import { bqBandpass, bqHighpass, bqLowpass } from '@/utils/biquad'

const FS = 256

function rmsThrough(stages: { step: (x: number) => number }[], freq: number, amp = 1, n = 1024, warmup = 256): number {
  let sumSq = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    let y = amp * Math.sin((2 * Math.PI * freq * i) / FS)
    for (const s of stages) y = s.step(y)
    if (i >= warmup) {
      sumSq += y * y
      count++
    }
  }
  return Math.sqrt(sumSq / count)
}

describe('biquad filters', () => {
  it('band-pass passes mid-band and attenuates out-of-band tones', () => {
    const mid = rmsThrough(bqBandpass(1, 10, FS), 5) // in [1,10]
    const low = rmsThrough(bqBandpass(1, 10, FS), 0.2) // below
    const high = rmsThrough(bqBandpass(1, 10, FS), 40) // above
    expect(mid).toBeGreaterThan(low * 3)
    expect(mid).toBeGreaterThan(high * 3)
  })

  it('EMG band (20-45 Hz) passes 30 Hz far more than 5 Hz', () => {
    const inBand = rmsThrough(bqBandpass(20, 45, FS), 30)
    const outBand = rmsThrough(bqBandpass(20, 45, FS), 5)
    expect(inBand).toBeGreaterThan(outBand * 3)
  })

  it('low-pass keeps DC and high-pass removes it', () => {
    const lp = bqLowpass(10, FS)
    const hp = bqHighpass(10, FS)
    let lpY = 0
    let hpY = 0
    for (let i = 0; i < 512; i++) {
      lpY = lp.step(1) // constant DC input
      hpY = hp.step(1)
    }
    expect(lpY).toBeCloseTo(1, 2) // DC passes the low-pass (unity gain)
    expect(Math.abs(hpY)).toBeLessThan(0.05) // DC blocked by the high-pass
  })

  it('reset clears filter state', () => {
    const f = bqLowpass(10, FS)
    for (let i = 0; i < 100; i++) f.step(5)
    f.reset()
    // First sample after reset behaves like a fresh filter (output = b0 * x).
    expect(f.step(0)).toBe(0)
  })
})
