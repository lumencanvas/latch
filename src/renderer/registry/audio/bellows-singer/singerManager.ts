/**
 * bellows-voice singer manager — the articulatory singing / speaking voice on LATCH's SHARED
 * bellows kernel.
 *
 * Each `bellows-singer` / `bellows-speak` node owns one `Singer` (a channel on the kernel's
 * `vocal` engine) and, optionally, one articulator probe that reads the voice's jaw / lips /
 * tongue / velum as the audio plays. The bellows-voice plugin is loaded into the kernel via
 * `loadVoicePlugin()` (b.use) the first time a voice node runs — flows that never sing never
 * fetch it.
 *
 * Lifecycle: per-node singers + probes are freed on node delete (gc) and on engine stop
 * (disposeAll); a kernel generation stamp turns any handle that outlived a kernel disposal into
 * a rebuild instead of a call into a dead kernel. The shared kernel is only torn down when the
 * last bellows user of ANY family is gone (registerKernelClient / releaseKernelIfIdle).
 */

import type { Bellows, BusHandle } from 'bellowsjs'
import type { Singer, ArticulatorProbe, ArticulatorFrame, SingNote, SingResult } from 'bellows-voice'
import { defineLifecycle } from '@/engine/nodeState'
import {
  loadVoicePlugin,
  kernelGeneration,
  isStaleKernelError,
  registerKernelClient,
  releaseKernelIfIdle,
  sharedReverbBus,
  type VoicePluginHandle,
} from '@/registry/audio/bellows-instrument/bellowsManager'

/** Probe frame rate: one frame per display frame is all a visual needs. */
const PROBE_RATE = 60
/** A stopped line's channel is cut almost immediately (a short tail avoids a click). */
const STOP_RELEASE_SECONDS = 0.05
/** A retired singer (voice swap / node delete) rings out briefly before the channel is freed. */
const RETIRE_RELEASE_SECONDS = 0.4

export interface SingerConfig {
  /** A bellows-voice starter voice id (VOICE_PRESETS). */
  voice: string
  accent: string
  /** Mouth posture id (SHAPE_PRESETS), 'neutral' = none. */
  shape: string
  gain: number
  pan: number
  send: number
  /** Run an articulator probe (max 8 per context) for the mouth outputs. */
  mouth: boolean
}

export type VoiceLine =
  | { kind: 'sing'; lyrics: string; notes: SingNote[] }
  | { kind: 'speak'; text: string; rate: number; hz?: number; breath: 'between' | 'all' | 'none' }

interface SingerRec {
  singer: Singer | null
  probe: ArticulatorProbe | null
  /** Kernel generation the singer was built on. */
  gen: number
  voice: string
  shape: string
  mix: { gain: number; pan: number; send: number } | null
  mouth: boolean
  loading: boolean
  error: string | null
  probeError: string | null
  /** gen|voice|accent whose singer() last threw — not retried until that changes. */
  failedBuild?: string
  /** Latest config / line requested while the plugin was loading (latest wins). */
  pendingCfg?: SingerConfig
  pendingLine: VoiceLine | null
  /** Context time the last posted line ends; 0 when idle. */
  lineEnd: number
  wasBusy: boolean
  ipa: string
  frame: ArticulatorFrame | null
}

let handle: VoicePluginHandle | null = null
const recs = new Map<string, SingerRec>()

registerKernelClient('bellows-voice', () => recs.size)

function errText(e: unknown): string {
  return String((e as { message?: string })?.message ?? e)
}

/** The plugin handle for the CURRENT kernel generation, or null (kicks the load). */
function currentHandle(): VoicePluginHandle | null {
  if (handle && handle.gen === kernelGeneration()) return handle
  handle = null
  return null
}

function stopProbe(rec: SingerRec): void {
  if (rec.probe) {
    try { rec.probe.stop() } catch { /* ignore */ }
    // A probe slot just freed: nodes parked on a probe error (e.g. the 8-per-context cap) may
    // try once more.
    for (const other of recs.values()) other.probeError = null
  }
  rec.probe = null
}

/** Free a record's singer + probe. The probe goes first (it parks the singer's probe slot). */
function retire(rec: SingerRec, releaseSeconds: number): void {
  stopProbe(rec)
  if (rec.singer) {
    try { rec.singer.dispose({ releaseSeconds }) } catch { /* ignore */ }
  }
  rec.singer = null
  rec.mix = null
  rec.lineEnd = 0
  // A cancelled line is not a finished one: don't let the next readout pulse `done`.
  rec.wasBusy = false
}

function startProbe(rec: SingerRec, h: VoicePluginHandle): void {
  // After a failure, wait for a mouth/voice change or a freed slot instead of retrying per frame.
  if (!rec.singer || rec.probe || !rec.mouth || rec.probeError) return
  try {
    rec.probe = h.mod.articulatorProbe(h.b, rec.singer, { rate: PROBE_RATE })
    rec.probeError = null
  } catch (e) {
    // e.g. the 8-probe-per-context cap: the voice still sings, the mouth outputs just hold.
    rec.probe = null
    rec.probeError = errText(e)
  }
}

function build(rec: SingerRec, h: VoicePluginHandle, cfg: SingerConfig): void {
  const key = `${h.gen}|${cfg.voice}|${cfg.accent}`
  // A failed singer() is retried only on a voice/accent change or a kernel rebuild.
  if (rec.error && rec.failedBuild === key) return
  try {
    rec.singer = h.mod.singer(h.b, cfg.voice, { accent: cfg.accent })
  } catch (e) {
    // Most likely cause: two copies of bellowsjs (the plugin registered on one, singer() checks
    // the other) — see the Vite note in the report / README "With Vite".
    rec.singer = null
    rec.error = errText(e)
    rec.failedBuild = key
    return
  }
  rec.failedBuild = undefined
  if (rec.voice !== cfg.voice) rec.probeError = null
  rec.gen = h.gen
  rec.voice = cfg.voice
  rec.shape = ''
  rec.mix = null
  rec.error = null
}

function applyConfig(rec: SingerRec, h: VoicePluginHandle, cfg: SingerConfig): void {
  if (rec.singer && (rec.gen !== h.gen || rec.voice !== cfg.voice)) {
    retire(rec, RETIRE_RELEASE_SECONDS)
  }
  if (!rec.singer) build(rec, h, cfg)
  const s = rec.singer
  if (!s) return

  s.accent = cfg.accent
  if (rec.shape !== cfg.shape) {
    try { s.shape(cfg.shape) } catch { /* ignore */ }
    rec.shape = cfg.shape
  }
  const mix = rec.mix
  if (!mix || mix.gain !== cfg.gain) { try { s.gain(cfg.gain) } catch { /* ignore */ } }
  if (!mix || mix.pan !== cfg.pan) { try { s.pan(cfg.pan) } catch { /* ignore */ } }
  if (!mix || mix.send !== cfg.send) {
    const bus: BusHandle | null = cfg.send > 0 || mix ? sharedReverbBus() : null
    if (bus) { try { s.send(bus, cfg.send) } catch { /* ignore */ } }
  }
  rec.mix = { gain: cfg.gain, pan: cfg.pan, send: cfg.send }

  if (rec.mouth !== cfg.mouth) rec.probeError = null
  rec.mouth = cfg.mouth
  if (cfg.mouth) startProbe(rec, h)
  else stopProbe(rec)
}

function lineEndOf(result: SingResult): number {
  let end = 0
  for (const p of result.phrases) if (p.end > end) end = p.end
  return end
}

function perform(rec: SingerRec, h: VoicePluginHandle, line: VoiceLine): void {
  const s = rec.singer
  if (!s) return
  try {
    const result = line.kind === 'sing'
      ? s.sing(line.lyrics, line.notes, { accent: s.accent })
      : s.speak(line.text, { accent: s.accent, rate: line.rate, hz: line.hz, breath: line.breath })
    rec.lineEnd = Math.max(rec.lineEnd, lineEndOf(result))
    const text = line.kind === 'sing' ? line.lyrics : line.text
    try {
      rec.ipa = h.mod.toIPA(text, { accent: typeof s.accent === 'string' ? s.accent : undefined })
    } catch {
      rec.ipa = ''
    }
    rec.error = null
  } catch (e) {
    rec.error = errText(e)
  }
}

function ensureRec(nodeId: string): SingerRec {
  let rec = recs.get(nodeId)
  if (!rec) {
    rec = {
      singer: null, probe: null, gen: -1, voice: '', shape: '', mix: null, mouth: true,
      loading: false, error: null, probeError: null, pendingLine: null,
      lineEnd: 0, wasBusy: false, ipa: '', frame: null,
    }
    recs.set(nodeId, rec)
  }
  return rec
}

function kickLoad(nodeId: string, rec: SingerRec, cfg: SingerConfig): void {
  if (rec.loading) return
  rec.loading = true
  loadVoicePlugin()
    .then((h) => {
      if (recs.get(nodeId) !== rec) return
      rec.loading = false
      if (h.gen !== kernelGeneration()) return
      handle = h
      applyConfig(rec, h, rec.pendingCfg ?? cfg)
      rec.pendingCfg = undefined
      if (rec.pendingLine) {
        perform(rec, h, rec.pendingLine)
        rec.pendingLine = null
      }
    })
    .catch((e) => {
      if (recs.get(nodeId) !== rec) return
      rec.loading = false
      if (!isStaleKernelError(e)) rec.error = errText(e)
    })
}

/**
 * Idempotently ensure the node's singer and push its config. Boot/plugin-load safe: while
 * loading, the config is stashed and applied on load. Call once per frame.
 */
export function configureSinger(nodeId: string, cfg: SingerConfig): void {
  const rec = ensureRec(nodeId)
  const h = currentHandle()
  if (h) {
    applyConfig(rec, h, cfg)
    return
  }
  rec.pendingCfg = cfg
  if (!rec.error) kickLoad(nodeId, rec, cfg)
}

/** Sing / speak a line now — or, while the voice is still loading, as soon as it's ready. */
export function performLine(nodeId: string, line: VoiceLine): void {
  const rec = recs.get(nodeId)
  if (!rec) return
  const h = currentHandle()
  if (h && rec.singer) perform(rec, h, line)
  else if (!rec.error) rec.pendingLine = line
}

/**
 * Cut the node's line(s) short. bellows has no per-channel "cancel posted events", so the
 * honest stop is to free the channel (posted phonemes die with it) and build a fresh singer.
 */
export function stopLine(nodeId: string, cfg: SingerConfig): void {
  const rec = recs.get(nodeId)
  if (!rec) return
  rec.pendingLine = null
  const h = currentHandle()
  if (!h || !rec.singer) return
  retire(rec, STOP_RELEASE_SECONDS)
  applyConfig(rec, h, cfg)
}

export interface SingerReadout {
  frame: ArticulatorFrame | null
  busy: boolean
  /** True on the single frame a line finishes. */
  done: boolean
  ipa: string
  error: string | null
}

/** Per-frame readout: the articulators being HEARD now, busy/done, and the line's IPA. */
export function readSinger(nodeId: string): SingerReadout {
  const rec = recs.get(nodeId)
  if (!rec) return { frame: null, busy: false, done: false, ipa: '', error: null }
  const h = currentHandle()
  const b: Bellows | null = h?.b ?? null
  if (rec.probe) {
    try {
      rec.frame = rec.probe.heard(rec.frame ?? undefined) ?? rec.frame
    } catch { /* keep the last frame */ }
  }
  const now = b ? b.ctx.currentTime : 0
  const busy = rec.lineEnd > 0 && now < rec.lineEnd
  const done = rec.wasBusy && !busy
  rec.wasBusy = busy
  return { frame: rec.frame, busy, done, ipa: rec.ipa, error: rec.error ?? rec.probeError }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function gcSingers(validNodeIds: Set<string>): void {
  let removed = false
  for (const [id, rec] of [...recs]) {
    if (!validNodeIds.has(id)) {
      retire(rec, RETIRE_RELEASE_SECONDS)
      recs.delete(id)
      removed = true
    }
  }
  if (removed) releaseKernelIfIdle()
}

function disposeAllSingers(): void {
  for (const rec of recs.values()) retire(rec, 0)
  recs.clear()
  handle = null
}

defineLifecycle({
  label: 'bellows-voice',
  gc: gcSingers,
  disposeAll: disposeAllSingers,
})

// ── Test seams ───────────────────────────────────────────────────────────────
/** Test-only: install a fake plugin handle for the current kernel generation. */
export function __setVoiceHandleForTest(h: { b: unknown; mod: unknown } | null): void {
  handle = h ? ({ b: h.b, mod: h.mod, gen: kernelGeneration() } as VoicePluginHandle) : null
}

export function __resetSingersForTest(): void {
  recs.clear()
  handle = null
  registerKernelClient('bellows-voice', () => recs.size)
}

export function __gcSingersForTest(valid: Set<string>): void {
  gcSingers(valid)
}

export function __disposeAllSingersForTest(): void {
  disposeAllSingers()
}
