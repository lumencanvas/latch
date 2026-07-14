/**
 * Muse (InteraXon) EEG signal processing — pure, hardware-independent.
 *
 * Ports the decode + feature math from the maintainer's reference Web-Bluetooth Muse app:
 * 12-bit EEG unpacking, µV scaling, δ/θ/α/β/γ band powers (Welch PSD), and streaming
 * blink / jaw-clench detectors. The BLE adapter (C1) feeds notifications through these;
 * keeping the DSP here makes it fixture-testable without a device.
 * See docs/plans/BLE_DEVICE_MANAGER_2026-07-13.md.
 */

import { welchPsd, bandPower } from '@/utils/fft'
import { bqBandpass, type Biquad } from '@/utils/biquad'

/** Muse EEG sample rate (Hz). */
export const MUSE_FS = 256
/** EEG samples carried in one BLE notification. */
export const EEG_SAMPLES_PER_PACKET = 12
/** µV per LSB — 12-bit over a 2 mVpp range. */
export const EEG_SCALE = 0.48828125
/** 12-bit mid-scale offset (raw counts are unsigned; subtract to centre on 0 µV). */
export const EEG_OFFSET = 0x800

/** The four scalp channels, in Muse's characteristic order (AUX omitted). */
export const MUSE_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'] as const
export type MuseChannel = (typeof MUSE_CHANNELS)[number]

export type MuseBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma'

/** Classic EEG bands as half-open [lo, hi) Hz ranges (matches the reference app). */
export const MUSE_BANDS: ReadonlyArray<{ name: MuseBand; lo: number; hi: number }> = [
  { name: 'delta', lo: 1, hi: 4 },
  { name: 'theta', lo: 4, hi: 8 },
  { name: 'alpha', lo: 8, hi: 13 },
  { name: 'beta', lo: 13, hi: 30 },
  { name: 'gamma', lo: 30, hi: 44 },
]

/**
 * Unpack the 18-byte EEG payload into 12 raw 12-bit sample counts (0..4095). Samples are
 * packed big-endian, two per three bytes: `[AAA AAAB BBBB BBBB]`.
 */
export function unpack12(payload: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < payload.length; i++) {
    if (i % 3 === 0) {
      out.push((payload[i] << 4) | (payload[i + 1] >> 4))
    } else {
      out.push(((payload[i] & 0xf) << 8) | payload[i + 1])
      i++
    }
  }
  return out
}

/** Convert a raw 12-bit count to microvolts. */
export function toMicrovolts(raw: number): number {
  return EEG_SCALE * (raw - EEG_OFFSET)
}

/** Decode the 18-byte EEG payload directly to 12 microvolt samples. */
export function decodeEegPacket(payload: ArrayLike<number>): number[] {
  return unpack12(payload).map(toMicrovolts)
}

/**
 * Parse a raw EEG characteristic notification: a 16-bit big-endian packet counter
 * followed by the 18-byte 12-bit payload. Returns the counter + decoded µV samples.
 */
export function parseEegNotification(view: DataView): { counter: number; samples: number[] } {
  // A valid EEG notification is 20 bytes (2-byte counter + 18-byte payload). Guard a
  // truncated/malformed packet — return no samples so the caller skips it, rather than
  // throwing a RangeError from the out-of-range Uint8Array view.
  if (view.byteLength < 20) return { counter: view.byteLength >= 2 ? view.getUint16(0) : 0, samples: [] }
  const counter = view.getUint16(0)
  const payload = new Uint8Array(view.buffer, view.byteOffset + 2, 18)
  return { counter, samples: decodeEegPacket(payload) }
}

/**
 * Absolute band powers (µV²) for one channel's recent samples, via Welch PSD. `signal`
 * should be a contiguous window of at least `640` samples (2.5 s @ 256 Hz) of µV values.
 */
export function bandPowers(signal: ArrayLike<number>, sampleRate = MUSE_FS): Record<MuseBand, number> {
  const psd = welchPsd(signal, { sampleRate })
  const out = {} as Record<MuseBand, number>
  for (const b of MUSE_BANDS) out[b.name] = bandPower(psd, sampleRate, b.lo, b.hi)
  return out
}

/** Band powers normalized to fractions of total band power (sum ≈ 1; all 0 if silent). */
export function relativeBandPowers(bp: Record<MuseBand, number>): Record<MuseBand, number> {
  const total = MUSE_BANDS.reduce((s, b) => s + bp[b.name], 0)
  const out = {} as Record<MuseBand, number>
  for (const b of MUSE_BANDS) out[b.name] = total > 0 ? bp[b.name] / total : 0
  return out
}

/** Common derived indices. Guards divide-by-zero (returns 0 when the denominator is 0). */
export function bandRatios(bp: Record<MuseBand, number>): { focus: number; relaxation: number; engagement: number } {
  const safe = (num: number, den: number) => (den > 0 ? num / den : 0)
  return {
    focus: safe(bp.beta, bp.alpha),
    relaxation: safe(bp.alpha, bp.theta),
    engagement: safe(bp.beta, bp.alpha + bp.theta),
  }
}

/**
 * Streaming blink detector: a 1–10 Hz band-pass on a frontal channel (AF7/AF8); an
 * excursion past `thresholdUv` fires a blink, rate-limited by `refractoryMs`. Feed one
 * µV sample at a time with a monotonic timestamp (ms).
 */
export class BlinkDetector {
  private readonly stages: [Biquad, Biquad]
  private lastMs = -Infinity
  constructor(
    private readonly thresholdUv = 110,
    private readonly refractoryMs = 300,
    fs = MUSE_FS
  ) {
    this.stages = bqBandpass(1, 10, fs)
  }
  /** Returns true on the sample that triggers a blink. */
  push(microvolts: number, timeMs: number): boolean {
    let y = microvolts
    y = this.stages[0].step(y)
    y = this.stages[1].step(y)
    if (Math.abs(y) > this.thresholdUv && timeMs - this.lastMs > this.refractoryMs) {
      this.lastMs = timeMs
      return true
    }
    return false
  }
}

/**
 * Streaming jaw-clench detector: a 20–45 Hz EMG band-pass on a temporal channel
 * (TP9/TP10) with a leaky-integrated mean-square energy envelope (`0.995·acc + 0.005·e²`).
 *
 * To gate a clench, compare {@link rms} (= √energy — the RMS/amplitude quantity) against a
 * moving baseline × factor: the reference app thresholds `√emgAcc > baseline × ~3`. Compare
 * against `.rms`, NOT the squared `.energy` (a `3×` factor on `.energy` would be `9×` in RMS
 * terms).
 */
export class ClenchDetector {
  private readonly stages: [Biquad, Biquad]
  private acc = 0
  constructor(fs = MUSE_FS) {
    this.stages = bqBandpass(20, 45, fs)
  }
  /** Feed one µV sample; returns the updated mean-square energy envelope. */
  push(microvolts: number): number {
    let e = microvolts
    e = this.stages[0].step(e)
    e = this.stages[1].step(e)
    this.acc = 0.995 * this.acc + 0.005 * (e * e)
    return this.acc
  }
  /** Current leaky-integrated EMG mean-square energy. */
  get energy(): number {
    return this.acc
  }
  /** RMS EMG amplitude (√energy) — the quantity the reference thresholds against a baseline. */
  get rms(): number {
    return Math.sqrt(this.acc)
  }
}
