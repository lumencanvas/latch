import { describe, it, expect } from 'vitest'
import { fft, hannWindow, isPowerOfTwo, welchPsd, bandPower } from '@/utils/fft'

function sine(freq: number, fs: number, n: number, amp = 1): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.cos((2 * Math.PI * freq * i) / fs)
  return out
}
function argmax(a: ArrayLike<number>): number {
  let bi = 0
  for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i
  return bi
}

describe('fft', () => {
  it('transforms a DC signal to a single non-zero bin at k=0', () => {
    const n = 8
    const re = new Float32Array(n).fill(1)
    const im = new Float32Array(n)
    fft(re, im)
    expect(re[0]).toBeCloseTo(8, 5)
    for (let k = 1; k < n; k++) expect(Math.hypot(re[k], im[k])).toBeLessThan(1e-4)
  })

  it('puts a pure cosine at its two conjugate bins with magnitude n/2', () => {
    const n = 16
    const m = 2
    const re = new Float32Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * m * i) / n)
    const im = new Float32Array(n)
    fft(re, im)
    const mag = Array.from(re, (r, k) => Math.hypot(r, im[k]))
    expect(mag[m]).toBeCloseTo(n / 2, 3)
    expect(mag[n - m]).toBeCloseTo(n / 2, 3)
    // No energy anywhere else.
    for (let k = 0; k < n; k++) if (k !== m && k !== n - m) expect(mag[k]).toBeLessThan(1e-3)
  })

  it('conserves energy (Parseval: sum|X|^2 / N == sum|x|^2)', () => {
    const re = Float32Array.from([1, -2, 3, 0.5, -1, 2, 4, -3])
    const im = new Float32Array(8)
    const timeEnergy = Array.from(re).reduce((s, v) => s + v * v, 0)
    fft(re, im)
    let specEnergy = 0
    for (let k = 0; k < re.length; k++) specEnergy += re[k] * re[k] + im[k] * im[k]
    expect(specEnergy / re.length).toBeCloseTo(timeEnergy, 4)
  })
})

describe('isPowerOfTwo / hannWindow', () => {
  it('recognizes powers of two', () => {
    expect([1, 2, 256, 1024].every(isPowerOfTwo)).toBe(true)
    expect([0, 3, 100, -2].some(isPowerOfTwo)).toBe(false)
  })
  it('builds a Hann window that is 0 at the ends and 1 in the middle', () => {
    const w = hannWindow(9)
    expect(w[0]).toBeCloseTo(0, 6)
    expect(w[8]).toBeCloseTo(0, 6)
    expect(w[4]).toBeCloseTo(1, 6)
  })
})

describe('welchPsd + bandPower', () => {
  const fs = 256

  it('peaks at the bin of a pure tone (1 Hz bins at segment=256)', () => {
    const psd = welchPsd(sine(10, fs, 640), { sampleRate: fs })
    expect(psd.length).toBe(129) // segment/2 + 1
    expect(argmax(psd)).toBe(10) // df = 256/256 = 1 Hz
  })

  it('is calibrated: total band power of a tone equals its variance A^2/2 (PSD scale)', () => {
    // Locks the absolute normalization 1/(fs*winpow), the one-sided x2, and the *df — none
    // of which the relative/ordinal tests can see. A 50 µV tone has power 50^2/2 = 1250.
    const psd = welchPsd(sine(10, fs, 640, 50), { sampleRate: fs })
    expect(bandPower(psd, fs, 1, 44)).toBeCloseTo(1250, -1)
  })

  it('concentrates a 10 Hz tone in the alpha band, not delta/gamma', () => {
    const psd = welchPsd(sine(10, fs, 640, 50), { sampleRate: fs })
    const alpha = bandPower(psd, fs, 8, 13)
    const delta = bandPower(psd, fs, 1, 4)
    const gamma = bandPower(psd, fs, 30, 44)
    expect(alpha).toBeGreaterThan(delta * 10)
    expect(alpha).toBeGreaterThan(gamma * 10)
  })

  it('uses half-open bands so an edge frequency lands in exactly one band', () => {
    // A 13 Hz tone belongs to beta [13,30), NOT alpha [8,13).
    const psd = welchPsd(sine(13, fs, 640, 50), { sampleRate: fs })
    expect(bandPower(psd, fs, 13, 30)).toBeGreaterThan(bandPower(psd, fs, 8, 13))
  })

  it('throws on a non-power-of-two segment or a too-short signal', () => {
    expect(() => welchPsd(sine(10, fs, 640), { sampleRate: fs, segment: 100 })).toThrow(/power of two/)
    expect(() => welchPsd(sine(10, fs, 100), { sampleRate: fs })).toThrow(/too short/)
  })

  it('removes DC so a large electrode offset does not swamp the low bands', () => {
    const tone = sine(10, fs, 640, 50)
    const offset = new Float32Array(640)
    for (let i = 0; i < 640; i++) offset[i] = tone[i] + 1000 // +1000 µV DC (real electrodes sit far from 0)
    const clean = welchPsd(tone, { sampleRate: fs })
    const withDc = welchPsd(offset, { sampleRate: fs })
    // Alpha (10 Hz) power essentially unchanged, and delta is not swamped by the offset.
    expect(bandPower(withDc, fs, 8, 13)).toBeCloseTo(bandPower(clean, fs, 8, 13), 2)
    expect(bandPower(withDc, fs, 1, 4)).toBeCloseTo(bandPower(clean, fs, 1, 4), 2)
    expect(bandPower(withDc, fs, 1, 4)).toBeLessThan(bandPower(withDc, fs, 8, 13))
  })

  it('analyzes the MOST RECENT samples of an over-long (streaming) buffer', () => {
    const need = 640
    const tone = sine(10, fs, need, 50)
    // Buffer = [ half A | half B ], each `need` long and non-overlapping. The tail
    // analyzed is exactly half B.
    // Tone in the FRESH tail (half B), silence before → alpha dominates.
    const tail = new Float32Array(need * 2)
    for (let i = 0; i < need; i++) tail[need + i] = tone[i]
    const psdTail = welchPsd(tail, { sampleRate: fs })
    expect(bandPower(psdTail, fs, 8, 13)).toBeGreaterThan(bandPower(psdTail, fs, 1, 4) * 5)

    // Tone only in the STALE prefix (half A, entirely outside the tail) → ~silent.
    const stale = new Float32Array(need * 2)
    for (let i = 0; i < need; i++) stale[i] = tone[i]
    const psdStale = welchPsd(stale, { sampleRate: fs })
    expect(bandPower(psdStale, fs, 8, 13)).toBeLessThan(bandPower(psdTail, fs, 8, 13) / 100)
  })
})
