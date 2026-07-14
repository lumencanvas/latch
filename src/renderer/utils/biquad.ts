/**
 * RBJ-cookbook biquad filters (Transposed Direct Form II), pure and dependency-free.
 * Used for streaming feature extraction on non-audio signals (e.g. Muse EEG blink /
 * jaw-clench detection), where the Web-Audio BiquadFilterNode isn't reachable.
 */

/** A single second-order (biquad) IIR section. Coefficients are pre-normalized by a0. */
export class Biquad {
  private z1 = 0
  private z2 = 0
  constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number
  ) {}

  /** Clear the filter state (call between disjoint streams). */
  reset(): void {
    this.z1 = 0
    this.z2 = 0
  }

  /** Process one sample; returns the filtered output. */
  step(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

/** Low-pass biquad at `f0` (Hz) for sample rate `fs`. */
export function bqLowpass(f0: number, fs: number, q = 0.7071): Biquad {
  const w = (2 * Math.PI * f0) / fs
  const c = Math.cos(w)
  const s = Math.sin(w)
  const al = s / (2 * q)
  const a0 = 1 + al
  return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0)
}

/** High-pass biquad at `f0` (Hz) for sample rate `fs`. */
export function bqHighpass(f0: number, fs: number, q = 0.7071): Biquad {
  const w = (2 * Math.PI * f0) / fs
  const c = Math.cos(w)
  const s = Math.sin(w)
  const al = s / (2 * q)
  const a0 = 1 + al
  return new Biquad((1 + c) / 2 / a0, (-(1 + c)) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0)
}

/**
 * A band-pass as a high-pass @lo followed by a low-pass @hi (matches the reference Muse
 * app). Returns the two sections; feed a sample through both in order.
 */
export function bqBandpass(lo: number, hi: number, fs: number): [Biquad, Biquad] {
  return [bqHighpass(lo, fs), bqLowpass(hi, fs)]
}
