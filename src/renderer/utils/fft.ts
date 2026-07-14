/**
 * Minimal pure-JS spectral DSP — a radix-2 FFT, a Hann window, a Welch PSD, and
 * band-power integration. Added because LATCH has NO reusable FFT: `Tone.FFT`/Meyda
 * both run on the live Web-Audio graph at the AudioContext sample rate, so they can't
 * analyse an arbitrary `Float32Array` (e.g. 256 Hz Muse EEG) off the audio clock
 * (see docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md §0.8). Pure + dependency-free.
 */

/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` are the real/imaginary parts;
 * their length MUST be a power of two. Overwrites both with the transform.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }
  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const pr = re[i + k]
        const pi = im[i + k]
        const qr = re[i + k + half] * cr - im[i + k + half] * ci
        const qi = re[i + k + half] * ci + im[i + k + half] * cr
        re[i + k] = pr + qr
        im[i + k] = pi + qi
        re[i + k + half] = pr - qr
        im[i + k + half] = pi - qi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/** True for a positive power of two. */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/** Periodic-ish Hann window of length `n` (`0.5 − 0.5·cos(2πi/(n−1))`). */
export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}

export interface WelchOptions {
  sampleRate: number
  /** FFT segment length (power of two). Default 256. */
  segment?: number
  /** Hop between segments. Default segment/2 (50% overlap). */
  hop?: number
  /** Number of averaged segments. Default 4. */
  segments?: number
}

/**
 * One-sided power spectral density via Welch's method (Hann-windowed, overlapped,
 * averaged). Returns `segment/2 + 1` bins; bin `k` is frequency `k·sampleRate/segment`.
 * The signal must be at least `segment + (segments−1)·hop` samples long.
 */
export function welchPsd(signal: ArrayLike<number>, opts: WelchOptions): Float32Array {
  const { sampleRate } = opts
  const segment = opts.segment ?? 256
  const hop = opts.hop ?? segment >> 1
  const segments = opts.segments ?? 4
  if (!isPowerOfTwo(segment)) throw new Error(`welchPsd: segment must be a power of two, got ${segment}`)
  const need = segment + (segments - 1) * hop
  if (signal.length < need) {
    throw new Error(`welchPsd: signal too short (${signal.length} < required ${need})`)
  }

  const hann = hannWindow(segment)
  let winpow = 0
  for (let i = 0; i < segment; i++) winpow += hann[i] * hann[i]

  const half = segment >> 1
  const out = new Float32Array(half + 1)
  const re = new Float32Array(segment)
  const im = new Float32Array(segment)

  for (let s = 0; s < segments; s++) {
    const off = s * hop
    for (let i = 0; i < segment; i++) {
      re[i] = signal[off + i] * hann[i]
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k <= half; k++) {
      const p = (re[k] * re[k] + im[k] * im[k]) / (sampleRate * winpow)
      // One-sided: double the interior bins, leave DC and Nyquist single; average over segments.
      out[k] += (k === 0 || k === half ? p : 2 * p) / segments
    }
  }
  return out
}

/**
 * Integrate a one-sided PSD over the half-open band `[loHz, hiHz)` (so adjacent bands
 * never share a bin). `psd` is a `welchPsd` result; `segment` is derived from its length.
 */
export function bandPower(psd: ArrayLike<number>, sampleRate: number, loHz: number, hiHz: number): number {
  const segment = (psd.length - 1) * 2
  const df = sampleRate / segment
  let sum = 0
  const k1 = Math.min(Math.ceil(hiHz / df), psd.length)
  for (let k = Math.ceil(loHz / df); k < k1; k++) sum += psd[k] * df
  return sum
}
