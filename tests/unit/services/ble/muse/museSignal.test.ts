import { describe, it, expect } from 'vitest'
import {
  unpack12,
  toMicrovolts,
  decodeEegPacket,
  parseEegNotification,
  bandPowers,
  relativeBandPowers,
  bandRatios,
  BlinkDetector,
  ClenchDetector,
  MUSE_BANDS,
  EEG_OFFSET,
  type MuseBand,
} from '@/services/ble/muse/museSignal'

const FS = 256
function sine(freq: number, n: number, amp = 1): number[] {
  return Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / FS))
}
function maxBand(bp: Record<MuseBand, number>): MuseBand {
  return MUSE_BANDS.reduce((m, b) => (bp[b.name] > bp[m.name] ? b : m)).name
}

describe('Muse EEG decode', () => {
  it('unpacks two 12-bit samples per three bytes (big-endian)', () => {
    // [0xAB, 0xCD, 0xEF] -> 0xABC (2748), 0xDEF (3567)
    expect(unpack12([0xab, 0xcd, 0xef])).toEqual([2748, 3567])
  })

  it('unpacks a full 18-byte payload to a known 12-sample vector', () => {
    // Pins actual values (not just length) so a bit-shift/endianness/off-by-one regression is caught.
    expect(unpack12([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])).toEqual([
      0, 258, 48, 1029, 96, 1800, 144, 2571, 192, 3342, 241, 17,
    ])
    // Full-scale nibbles decode to the 12-bit max with no sign-extension.
    expect(unpack12([0xff, 0xff, 0xff])).toEqual([4095, 4095])
  })

  it('scales counts to microvolts around the 0x800 mid-point', () => {
    expect(toMicrovolts(EEG_OFFSET)).toBe(0)
    expect(toMicrovolts(0)).toBe(-1000) // 0.48828125 * 2048 == 1000 exactly
    expect(toMicrovolts(4095)).toBeCloseTo(999.51, 2) // positive full-scale rail (12-bit max)
    expect(decodeEegPacket([0xab, 0xcd, 0xef])[0]).toBe(toMicrovolts(2748))
  })

  it('parses a notification: 16-bit big-endian counter + 18-byte payload', () => {
    const buf = new ArrayBuffer(20)
    const dv = new DataView(buf)
    dv.setUint16(0, 0x1234) // counter
    for (let i = 0; i < 18; i++) dv.setUint8(2 + i, i)
    const { counter, samples } = parseEegNotification(dv)
    expect(counter).toBe(0x1234)
    expect(samples).toHaveLength(12)
    expect(samples[0]).toBe(decodeEegPacket(new Uint8Array(buf, 2, 18))[0])
  })
})

describe('Muse band powers', () => {
  it('reports a 10 Hz signal as alpha-dominant', () => {
    expect(maxBand(bandPowers(sine(10, 640, 50)))).toBe('alpha')
  })

  it('reports a 2 Hz signal as delta-dominant', () => {
    expect(maxBand(bandPowers(sine(2, 640, 50)))).toBe('delta')
  })

  it('relative band powers sum to ~1 (and are all 0 for a silent signal)', () => {
    const rel = relativeBandPowers(bandPowers(sine(10, 640, 50)))
    const total = MUSE_BANDS.reduce((s, b) => s + rel[b.name], 0)
    expect(total).toBeCloseTo(1, 5)
    const silent = relativeBandPowers(bandPowers(new Array(640).fill(0)))
    expect(MUSE_BANDS.every((b) => silent[b.name] === 0)).toBe(true)
  })

  it('bandRatios guards divide-by-zero (undefined ratio -> 0, not Infinity/NaN)', () => {
    // alpha=0 -> focus 0; theta=0 -> relaxation 0; alpha+theta=0 -> engagement 0.
    expect(bandRatios({ delta: 0, theta: 0, alpha: 0, beta: 1, gamma: 0 })).toEqual({
      focus: 0,
      relaxation: 0,
      engagement: 0,
    })
    // A well-defined case computes the real ratios.
    expect(bandRatios({ delta: 0, theta: 2, alpha: 4, beta: 8, gamma: 0 })).toEqual({
      focus: 2, // beta/alpha = 8/4
      relaxation: 2, // alpha/theta = 4/2
      engagement: 8 / 6, // beta/(alpha+theta)
    })
  })
})

describe('BlinkDetector', () => {
  it('fires on a strong low-frequency excursion, honoring the refractory period', () => {
    const d = new BlinkDetector(110, 300, FS)
    const wave = sine(3, 512, 300) // 3 Hz, 300 µV — a blink-like frontal deflection
    const fires: number[] = []
    for (let i = 0; i < wave.length; i++) {
      if (d.push(wave[i], (i / FS) * 1000)) fires.push((i / FS) * 1000)
    }
    expect(fires.length).toBeGreaterThan(0)
    for (let i = 1; i < fires.length; i++) expect(fires[i] - fires[i - 1]).toBeGreaterThan(300)
  })

  it('does not fire on a quiet signal', () => {
    const d = new BlinkDetector(110, 300, FS)
    let fired = false
    const wave = sine(3, 512, 5) // 5 µV — well below threshold
    for (let i = 0; i < wave.length; i++) fired = d.push(wave[i], (i / FS) * 1000) || fired
    expect(fired).toBe(false)
  })
})

describe('ClenchDetector', () => {
  it('builds more energy from in-band EMG (30 Hz) than out-of-band (5 Hz)', () => {
    const inBand = new ClenchDetector(FS)
    const outBand = new ClenchDetector(FS)
    const hi = sine(30, 512, 100)
    const lo = sine(5, 512, 100)
    for (let i = 0; i < 512; i++) {
      inBand.push(hi[i])
      outBand.push(lo[i])
    }
    expect(inBand.energy).toBeGreaterThan(outBand.energy * 3)
  })

  it('exposes rms = sqrt(energy) — the RMS domain the reference thresholds against', () => {
    const d = new ClenchDetector(FS)
    const wave = sine(30, 512, 100)
    for (let i = 0; i < 512; i++) d.push(wave[i])
    expect(d.rms).toBeCloseTo(Math.sqrt(d.energy), 10)
  })
})
