/**
 * MuseAdapter — Muse 2 (InteraXon) EEG headband over Web Bluetooth.
 *
 * Extends {@link BleAdapter}: it reuses all the GATT/notification/leak-safe plumbing and
 * only adds Muse specifics — the single `0xfe8d` service, the 5 EEG + telemetry
 * characteristics, the control start-sequence, and feeding notifications through the pure
 * DSP in `services/ble/muse/museSignal.ts`. The heavy decode/FFT lives here so the node
 * stays thin (the head-map view just renders the snapshot this exposes).
 *
 * Connect is gesture-free: the device was already granted by the "Add Bluetooth Device"
 * panel (a user gesture); `doConnect` re-resolves it by id via `getDevices()` and never
 * calls `requestDevice`, so the run-loop auto-connect is legal (BLE_DEVICE_MANAGER §0.1).
 */

import { BleAdapter } from './BleAdapter'
import type { BleConnectionConfig } from '../types'
import {
  MUSE_CHANNELS,
  MUSE_FS,
  MUSE_BANDS,
  type MuseBand,
  type MuseChannel,
  parseEegNotification,
  bandPowers,
  bandRatios,
  BlinkDetector,
  ClenchDetector,
} from '@/services/ble/muse/museSignal'

// ── Muse GATT (from the reference app) ──────────────────────────────────────
const MUSE_SERVICE = '0000fe8d-0000-1000-8000-00805f9b34fb'
const muse = (short: string) => `273e${short}-4c4d-454d-96be-f03bac821358`
const CTRL_CHAR = muse('0001')
const TELEMETRY_CHAR = muse('000b')
/** EEG characteristics in Muse channel order (TP9, AF7, AF8, TP10). AUX (0007) unused. */
const EEG_CHARS: Record<MuseChannel, string> = {
  TP9: muse('0003'),
  AF7: muse('0004'),
  AF8: muse('0005'),
  TP10: muse('0006'),
}

const RING = 768 // ~3 s @ 256 Hz; band power needs ≥ 640 (2.5 s)
const CLENCH_WARMUP = 256 // ~1 s: skip clench detection until the EMG envelope settles
const BANDS_INTERVAL_MS = 200 // recompute band powers ~5×/s (FFT is not free)
const FRONTAL: MuseChannel[] = ['AF7', 'AF8'] // blink
const TEMPORAL: MuseChannel[] = ['TP9', 'TP10'] // jaw clench

export interface MuseConnectionConfig extends Omit<BleConnectionConfig, 'serviceUUID'> {
  /** Forced to the Muse service by the adapter; optional for callers. */
  serviceUUID?: string
  /** Stable id of the granted device (resolved gesture-free via getDevices()). */
  deviceId: string
  /** Muse preset: p50 (EEG+PPG), p21 (EEG), p20. Applied on connect. */
  preset?: string
}

type BandRecord = Record<MuseBand, number>
const zeroBands = (): BandRecord => ({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 })

export interface MuseSnapshot {
  /** Latest µV sample per channel. */
  channels: Record<MuseChannel, number>
  /** Band powers averaged across channels (absolute µV²). */
  bands: BandRecord
  /** Per-channel band powers. */
  perChannel: Record<MuseChannel, BandRecord>
  /** Signal-quality heuristic per channel, 0 (no contact) … 1 (good). */
  contact: Record<MuseChannel, number>
  /** β/α focus index and α/θ calm index (averaged across channels). */
  focus: number
  calm: number
  /** Battery 0…1 (from telemetry), or null until the first telemetry packet. */
  battery: number | null
}

/**
 * Frame a Muse control command as `[len][ascii…][\n]`, where `len` counts the bytes that
 * follow (the ascii command PLUS the newline). BleAdapter.writeCharacteristic's string path
 * does not add this frame, so the adapter builds the raw buffer with this.
 */
export function frameMuseCommand(cmd: string): Uint8Array {
  const body = new TextEncoder().encode(`${cmd}\n`)
  const framed = new Uint8Array(body.length + 1)
  framed[0] = body.length
  framed.set(body, 1)
  return framed
}

/** Battery fraction (0…1) from a telemetry packet, or null if too short. Battery ≈ raw/512 %. */
export function batteryFromTelemetry(view: DataView): number | null {
  if (view.byteLength < 4) return null
  return Math.max(0, Math.min(1, view.getUint16(2) / 512 / 100))
}

/** Contact heuristic: RMS in a plausible EEG range → good; flat/railed → poor. */
export function contactFromRms(rms: number): number {
  if (!Number.isFinite(rms) || rms < 1.5) return 0 // flat / disconnected
  if (rms > 350) return Math.max(0, 1 - (rms - 350) / 350) // railing / motion
  if (rms < 8) return (rms - 1.5) / 6.5 // ramp in
  return 1
}

export class MuseAdapter extends BleAdapter {
  private readonly museConfig: MuseConnectionConfig
  private readonly rings: Record<MuseChannel, number[]>
  private readonly latest: Record<MuseChannel, number>
  private readonly blink: Record<MuseChannel, BlinkDetector>
  private readonly clench: Record<MuseChannel, ClenchDetector>
  private blinkThresholdUv: number
  private clenchFactor: number
  /** Per-channel EMG baseline (a shared one lets the hotter electrode bias the cooler). */
  private clenchBaseline: Record<MuseChannel, number>
  /** Per-channel samples since (re)connect — clench is gated until the envelope warms up. */
  private clenchSamples: Record<MuseChannel, number>
  private blinkFlag = false
  private clenchFlag = false
  private battery: number | null = null
  private lastBandsAt = 0
  private cachedBands: Record<MuseChannel, BandRecord>

  constructor(connectionId: string, config: MuseConnectionConfig, blinkUv = 110, clenchFactor = 3) {
    // Force the Muse service so BleAdapter.discoverServices enumerates its characteristics.
    super(connectionId, { ...config, serviceUUID: MUSE_SERVICE })
    this.museConfig = { ...config, serviceUUID: MUSE_SERVICE }
    this.blinkThresholdUv = blinkUv
    this.clenchFactor = clenchFactor
    this.rings = { TP9: [], AF7: [], AF8: [], TP10: [] }
    this.latest = { TP9: 0, AF7: 0, AF8: 0, TP10: 0 }
    this.clenchBaseline = { TP9: 0, AF7: 0, AF8: 0, TP10: 0 }
    this.clenchSamples = { TP9: 0, AF7: 0, AF8: 0, TP10: 0 }
    this.cachedBands = { TP9: zeroBands(), AF7: zeroBands(), AF8: zeroBands(), TP10: zeroBands() }
    this.blink = {
      TP9: new BlinkDetector(blinkUv), AF7: new BlinkDetector(blinkUv),
      AF8: new BlinkDetector(blinkUv), TP10: new BlinkDetector(blinkUv),
    }
    this.clench = {
      TP9: new ClenchDetector(), AF7: new ClenchDetector(),
      AF8: new ClenchDetector(), TP10: new ClenchDetector(),
    }
  }

  protected override async doConnect(): Promise<void> {
    // Resolve the panel-granted device WITHOUT a gesture; never requestDevice from here.
    const device = await BleAdapter.getDeviceById(this.museConfig.deviceId)
    if (this._disposed) return // recreated/deleted mid-connect: bail before touching GATT
    if (!device) {
      throw new Error('Muse not paired — open "Add Bluetooth Device" and connect the headband')
    }
    this.setDevice(device) // idempotent; base doConnect then skips its own scan
    await super.doConnect() // gatt.connect + discoverServices(0xfe8d) → characteristics map
    if (this._disposed) return // disposed during the awaited connect — don't start streaming
    await this.startMuse()
  }

  /** Subscribe the EEG + telemetry characteristics and run the control start-sequence. */
  private async startMuse(): Promise<void> {
    this.resetStreamState() // fresh detectors/rings/flags per (re)connect
    for (const ch of MUSE_CHANNELS) {
      await this.subscribeToNotifications(EEG_CHARS[ch], (_v, raw) => this.onEeg(ch, raw), 'raw')
    }
    await this.subscribeToNotifications(TELEMETRY_CHAR, (_v, raw) => this.onTelemetry(raw), 'raw')

    // Control sequence: halt → preset → status → resume (start streaming). The intra-handshake
    // writes are tolerant (a command may be rejected mid-sequence), but a failed RESUME means no
    // data will ever flow — let it propagate so the connect fails loudly instead of going silent.
    await this.writeControl('h')
    await this.writeControl(this.museConfig.preset || 'p50')
    await this.writeControl('s')
    await this.writeCharacteristic(CTRL_CHAR, frameMuseCommand('d'), 'raw')
  }

  /** Reset all streaming state so a (re)connect re-primes cleanly (no stale triggers/data). */
  private resetStreamState(): void {
    this.blinkFlag = false
    this.clenchFlag = false
    for (const ch of MUSE_CHANNELS) {
      this.rings[ch].length = 0
      this.blink[ch] = new BlinkDetector(this.blinkThresholdUv)
      this.clench[ch] = new ClenchDetector()
      this.clenchBaseline[ch] = 0
      this.clenchSamples[ch] = 0
    }
  }

  /**
   * Muse control command framing: `[len][ascii…][\n]`, where `len` counts the bytes that
   * follow (the ascii command PLUS the newline). BleAdapter.writeCharacteristic's string
   * path does not add this frame, so build the raw buffer here.
   */
  private async writeControl(cmd: string): Promise<void> {
    try {
      await this.writeCharacteristic(CTRL_CHAR, frameMuseCommand(cmd), 'raw')
    } catch {
      // A command may be rejected mid-handshake; the stream still starts in practice.
    }
  }

  private onEeg(ch: MuseChannel, raw: DataView): void {
    const { samples } = parseEegNotification(raw)
    if (samples.length === 0) return
    const ring = this.rings[ch]
    const now = performance.now()
    const isFrontal = FRONTAL.includes(ch)
    const isTemporal = TEMPORAL.includes(ch)
    for (const s of samples) {
      ring.push(s)
      if (isFrontal && this.blink[ch].push(s, now)) this.blinkFlag = true
      if (isTemporal) {
        this.clench[ch].push(s)
        // Gate clench until the leaky EMG envelope has warmed up (~1 s): its RMS ramps from
        // ~0 to steady state over ~200 samples, so an ungated baseline seeds tiny and the
        // ramp trips a phantom clench right after connect.
        if (++this.clenchSamples[ch] < CLENCH_WARMUP) continue
        // Per-channel baseline × factor (a shared baseline lets one electrode bias the other).
        const rms = this.clench[ch].rms
        const base = this.clenchBaseline[ch]
        this.clenchBaseline[ch] = base === 0 ? rms : base * 0.999 + rms * 0.001
        if (this.clenchBaseline[ch] > 0 && rms > this.clenchBaseline[ch] * this.clenchFactor) this.clenchFlag = true
      }
    }
    if (ring.length > RING) ring.splice(0, ring.length - RING)
    this.latest[ch] = samples[samples.length - 1]
  }

  private onTelemetry(raw: DataView): void {
    // Telemetry: [seq(2), battery(2), fuel(2), adc(2), temp(2)].
    const b = batteryFromTelemetry(raw)
    if (b !== null) this.battery = b
  }

  /** Recreate the blink/clench detectors when thresholds change (called by the node). */
  setThresholds(blinkUv: number, clenchFactor: number): void {
    this.clenchFactor = clenchFactor
    if (blinkUv !== this.blinkThresholdUv) {
      this.blinkThresholdUv = blinkUv
      for (const ch of MUSE_CHANNELS) this.blink[ch] = new BlinkDetector(blinkUv)
    }
  }

  /** True (and clears) if a blink fired since the last call — edge-consume for a trigger port. */
  takeBlink(): boolean { const b = this.blinkFlag; this.blinkFlag = false; return b }
  takeClench(): boolean { const c = this.clenchFlag; this.clenchFlag = false; return c }

  /** The current live snapshot the node/head-map render. Band powers are recomputed throttled. */
  getSnapshot(): MuseSnapshot {
    const now = performance.now()
    if (now - this.lastBandsAt >= BANDS_INTERVAL_MS) {
      this.lastBandsAt = now
      for (const ch of MUSE_CHANNELS) {
        this.cachedBands[ch] = this.rings[ch].length >= 640 ? bandPowers(this.rings[ch]) : zeroBands()
      }
    }
    const perChannel = this.cachedBands
    const bands = zeroBands()
    for (const b of MUSE_BANDS) {
      let sum = 0
      for (const ch of MUSE_CHANNELS) sum += perChannel[ch][b.name]
      bands[b.name] = sum / MUSE_CHANNELS.length
    }
    const contact = {} as Record<MuseChannel, number>
    for (const ch of MUSE_CHANNELS) contact[ch] = contactFromRms(rms(this.rings[ch]))
    const ratios = bandRatios(bands)
    return {
      channels: { ...this.latest },
      bands,
      perChannel: { TP9: { ...perChannel.TP9 }, AF7: { ...perChannel.AF7 }, AF8: { ...perChannel.AF8 }, TP10: { ...perChannel.TP10 } },
      contact,
      focus: ratios.focus,
      calm: ratios.relaxation,
      battery: this.battery,
    }
  }
}

/** RMS of the most-recent ~1 s window (cheap contact heuristic). */
function rms(ring: number[]): number {
  if (ring.length === 0) return 0
  const n = Math.min(ring.length, MUSE_FS)
  let sum = 0
  for (let i = ring.length - n; i < ring.length; i++) sum += ring[i] * ring[i]
  return Math.sqrt(sum / n)
}
