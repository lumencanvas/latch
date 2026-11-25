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
import type { PronouncingDictionary } from 'bellows-voice/text'
import { defineLifecycle } from '@/engine/nodeState'
import {
  loadVoicePlugin,
  kernelGeneration,
  isStaleKernelError,
  registerKernelClient,
  releaseKernelIfIdle,
  sharedReverbBus,
  routeChannel,
  releaseDirectPorts,
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
  /**
   * Read words through the CMU Pronouncing Dictionary (bellows-voice/dict) instead of only the
   * letter-to-sound rules (~77% of common words exact): reduced vowels (schwa), stress and
   * irregular words ("island", "colonel", "beautiful") come out right. Loaded once, on demand.
   */
  dictionary: boolean
}

export type VoiceLine =
  | { kind: 'sing'; lyrics: string; notes: SingNote[] }
  | { kind: 'speak'; text: string; rate: number; hz?: number; breath: 'between' | 'all' | 'none' }
  | { kind: 'beat'; pattern: string; bpm: number; swing: number; repeat: number; vel: number }

interface SingerRec {
  singer: Singer | null
  probe: ArticulatorProbe | null
  /** Kernel generation the singer was built on. */
  gen: number
  voice: string
  shape: string
  mix: { gain: number; pan: number; send: number } | null
  mouth: boolean
  /** This node wants the pronouncing dictionary (its `dictionary` control). */
  wantDict: boolean
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

// ── Pronouncing dictionary (shared, loaded once on first use) ─────────────────
// ~570 KB gzipped, its own chunk: a flow that never sings — or turns the toggle off — never
// fetches it. Kernel-independent (plain data), so it survives Stop/Play.
let dict: PronouncingDictionary | null = null
let dictLoading = false
let dictFailed = false

function ensureDictionary(): void {
  if (dict || dictLoading || dictFailed) return
  dictLoading = true
  import('bellows-voice/dict')
    .then((m) => {
      dict = m.cmudict()
    })
    .catch((e) => {
      dictFailed = true
      console.warn('[bellows-voice] pronouncing dictionary failed to load; using letter-to-sound rules:', e)
    })
    .finally(() => {
      dictLoading = false
      // Lines held back for the dictionary go out now (with it, or with the rules on failure).
      const h = currentHandle()
      if (!h) return
      for (const rec of recs.values()) {
        if (rec.singer) rec.singer.dictionary = rec.wantDict ? dict : null
        flushPending(rec, h)
      }
    })
}

/** True while a line should wait for the dictionary instead of being read by the rules. */
function waitingForDict(rec: SingerRec): boolean {
  return rec.wantDict && !dict && !dictFailed
}

/** Perform a held line once the singer is built and (if wanted) the dictionary is ready. */
function flushPending(rec: SingerRec, h: VoicePluginHandle): void {
  if (!rec.pendingLine || !rec.singer || waitingForDict(rec)) return
  const line = rec.pendingLine
  rec.pendingLine = null
  perform(rec, h, line)
}

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
  for (const [id, r] of recs) if (r === rec) { held.delete(id); lastShape.delete(id) }
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
  rec.wantDict = cfg.dictionary
  if (cfg.dictionary) ensureDictionary()
  s.dictionary = cfg.dictionary ? dict : null
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
      : line.kind === 'beat'
        ? s.beatbox(line.pattern, { bpm: line.bpm, swing: line.swing, repeat: line.repeat, vel: line.vel })
        : s.speak(line.text, { accent: s.accent, rate: line.rate, hz: line.hz, breath: line.breath })
    rec.lineEnd = Math.max(rec.lineEnd, lineEndOf(result))
    if (line.kind === 'beat') {
      rec.ipa = ''
      rec.error = null
      return
    }
    const text = line.kind === 'sing' ? line.lyrics : line.text
    try {
      rec.ipa = h.mod.toIPA(text, {
        accent: typeof s.accent === 'string' ? s.accent : undefined,
        dictionary: s.dictionary ?? undefined,
      })
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
      singer: null, probe: null, gen: -1, voice: '', shape: '', mix: null, mouth: true, wantDict: false,
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
      flushPending(rec, h)
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
  if (h && rec.singer && !waitingForDict(rec)) perform(rec, h, line)
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

// ── Playing the voice like an instrument (bellows-vocal-keys) ────────────────
// bellows-voice has no live-keyboard API, but its pieces compose into one: the `vocal` engine
// sings whatever `phoneme` its channel holds, morphs to a new one at articulator speed when the
// param changes mid-note, and bends pitch with `bend` (semitones, ±48) without re-attacking. So a
// key press = note-on with the syllable's onset consonants then its vowel scheduled a few tens
// of ms apart, the vowel sustains while held, and the release sings the coda then note-off.

/** One syllable as vocal-engine phoneme indices. */
export interface VocalPhones {
  text: string
  ipa: string
  onset: number[]
  /** The vowel; two entries for a diphthong (the glide target second). */
  nucleus: number[]
  coda: number[]
}

/** Seconds per consonant; a diphthong's second vowel arrives after DIPHTHONG_GLIDE. */
const CONSONANT_SECONDS = 0.06
const DIPHTHONG_GLIDE = 0.16
/** Scheduling slack so the first phoneme and the note-on land together. */
const KEY_LEAD = 0.01

interface HeldKey {
  id: number
  note: number
  coda: number[]
}
const held = new Map<string, HeldKey>()
/** Mouth Voice: the last phoneme/articulator values posted per node (re-sent after a new singer). */
const lastShape = new Map<string, Record<string, number>>()
const syllableCache = new Map<string, VocalPhones[]>()

function phonemeIndices(mod: VoicePluginHandle['mod'], ipa: string): number[] {
  const clean = ipa.replace(/[ˈˌːˑ.]/g, '')
  const whole = mod.vocalPhonemeIndex(clean)
  if (whole >= 0) return [whole]
  // a diphthong or a cluster the engine has no single sound for: its parts, longest match first
  const out: number[] = []
  let i = 0
  while (i < clean.length) {
    let matched = 0
    for (let len = Math.min(3, clean.length - i); len >= 1; len--) {
      const idx = mod.vocalPhonemeIndex(clean.slice(i, i + len))
      if (idx >= 0) { out.push(idx); matched = len; break }
    }
    i += matched || 1
  }
  return out
}

/**
 * Lyric text → syllables as phoneme indices, through the node's accent and (if loaded) the
 * pronouncing dictionary. null until the voice plugin is loaded. Cached per text + accent + dict.
 */
export function vocalSyllables(nodeId: string, text: string): VocalPhones[] | null {
  const rec = recs.get(nodeId)
  const h = currentHandle()
  const s = rec?.singer
  if (!rec || !h || !s || waitingForDict(rec)) return null
  const accent = typeof s.accent === 'string' ? s.accent : 'general-american'
  const key = `${accent}|${s.dictionary ? 'd' : '-'}|${text}`
  const cached = syllableCache.get(key)
  if (cached) return cached
  let out: VocalPhones[] = []
  try {
    const syl = h.mod.lyricsToSyllables(text, { accent, dictionary: s.dictionary ?? undefined })
    out = syl.map((x) => ({
      text: x.text,
      ipa: [...x.onset, x.nucleus, ...x.coda].map((g) => g.ipa).join(''),
      onset: x.onset.flatMap((g) => phonemeIndices(h.mod, g.ipa)),
      nucleus: phonemeIndices(h.mod, x.nucleus.ipa),
      coda: x.coda.flatMap((g) => phonemeIndices(h.mod, g.ipa)),
    })).filter((x) => x.nucleus.length > 0)
  } catch (e) {
    rec.error = errText(e)
  }
  if (syllableCache.size > 64) syllableCache.clear()
  syllableCache.set(key, out)
  return out
}

/** A plain vowel (or any single IPA sound) as a syllable. */
export function vocalVowel(nodeId: string, ipa: string): VocalPhones | null {
  const h = currentHandle()
  if (!h || !recs.get(nodeId)?.singer) return null
  const nucleus = phonemeIndices(h.mod, ipa)
  return nucleus.length ? { text: ipa, ipa, onset: [], nucleus, coda: [] } : null
}

/** Schedule onset → vowel (→ glide) from `t` on the node's singer. */
function schedulePhones(s: Singer, phones: VocalPhones, t: number): void {
  let at = t
  for (const p of phones.onset) {
    s.param('phoneme', p, at)
    at += CONSONANT_SECONDS
  }
  s.param('phoneme', phones.nucleus[0], at)
  for (let i = 1; i < phones.nucleus.length; i++) s.param('phoneme', phones.nucleus[i], at + i * DIPHTHONG_GLIDE)
}

/**
 * Key down: sing `phones` on `note`. Mono: a key already held is released first, unless `legato`,
 * which keeps the note sounding and re-articulates the new syllable while the pitch bends to it.
 */
export function vocalKeyDown(nodeId: string, phones: VocalPhones, note: number, vel: number, legato: boolean): void {
  const rec = recs.get(nodeId)
  const h = currentHandle()
  const s = rec?.singer
  if (!rec || !h || !s) return
  const now = h.b.ctx.currentTime + KEY_LEAD
  const prev = held.get(nodeId)
  try {
    if (prev && legato) {
      s.param('bend', note - prev.note, now)
      schedulePhones(s, phones, now)
      held.set(nodeId, { id: prev.id, note: prev.note, coda: phones.coda })
      rec.ipa = phones.ipa
      return
    }
    if (prev) vocalKeyUp(nodeId)
    s.param('bend', 0, now)
    schedulePhones(s, phones, now)
    const id = s.on(note, vel, now)
    held.set(nodeId, { id, note, coda: phones.coda })
    rec.ipa = phones.ipa
    rec.error = null
  } catch (e) {
    rec.error = errText(e)
  }
}

/** Glide the held note to a new pitch without re-attacking (legato, vowel mode). */
export function vocalBend(nodeId: string, note: number): void {
  const k = held.get(nodeId)
  const s = recs.get(nodeId)?.singer
  const h = currentHandle()
  if (!k || !s || !h) return
  try { s.param('bend', note - k.note, h.b.ctx.currentTime + KEY_LEAD) } catch { /* ignore */ }
}

/** Key up: sing the held syllable's coda, then release the note. */
export function vocalKeyUp(nodeId: string): void {
  const k = held.get(nodeId)
  held.delete(nodeId)
  const s = recs.get(nodeId)?.singer
  const h = currentHandle()
  if (!k || !s || !h) return
  const now = h.b.ctx.currentTime + KEY_LEAD
  try {
    k.coda.forEach((p, i) => s.param('phoneme', p, now + i * CONSONANT_SECONDS))
    s.off(k.id, now + k.coda.length * CONSONANT_SECONDS)
  } catch { /* the singer was retired: its notes went with it */ }
}

export function vocalHeld(nodeId: string): boolean {
  return held.has(nodeId)
}

/** Vocal-engine params a live mouth may steer (settings offsets, -1..1, except glide in seconds). */
const LIVE_SHAPE_PARAMS = new Set(['jawSet', 'lipRound', 'lipOpen', 'tongueHigh', 'tongueFront', 'nasal', 'glide', 'breath'])

/** The engine's phoneme index for one IPA sound (-1 when it has none, or the voice is still loading). */
export function vocalIndex(ipa: string): number {
  const h = currentHandle()
  return h ? h.mod.vocalPhonemeIndex(ipa) : -1
}

/**
 * Live articulation for a held note: move to `phoneme` (the engine morphs at its glide speed) and
 * set articulator offsets. Only values that changed are posted, so a node may call this every frame.
 */
export function vocalShape(nodeId: string, phoneme: number | null, params: Record<string, number>): void {
  const s = recs.get(nodeId)?.singer
  if (!s) return
  const last = lastShape.get(nodeId) ?? {}
  try {
    if (phoneme !== null && phoneme >= 0 && last.phoneme !== phoneme) {
      s.param('phoneme', phoneme)
      last.phoneme = phoneme
    }
    for (const [k, v] of Object.entries(params)) {
      if (!LIVE_SHAPE_PARAMS.has(k) || !Number.isFinite(v)) continue
      if (last[k] !== undefined && Math.abs(last[k] - v) < 0.02) continue
      s.param(k, v)
      last[k] = v
    }
    lastShape.set(nodeId, last)
  } catch { /* the singer was retired */ }
}

/** Route the node's voice to its wired Audio output (or master); the Tone node for the port. */
export function routeSinger(nodeId: string, wired: boolean) {
  const rec = recs.get(nodeId)
  return routeChannel(nodeId, rec?.singer?.instrument ?? null, wired)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function gcSingers(validNodeIds: Set<string>): void {
  let removed = false
  for (const [id, rec] of [...recs]) {
    if (!validNodeIds.has(id)) {
      retire(rec, RETIRE_RELEASE_SECONDS)
      recs.delete(id)
      releaseDirectPorts(id)
      removed = true
    }
  }
  if (removed) releaseKernelIfIdle()
}

function disposeAllSingers(): void {
  for (const rec of recs.values()) retire(rec, 0)
  recs.clear()
  held.clear()
  lastShape.clear()
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
  held.clear()
  lastShape.clear()
  syllableCache.clear()
  handle = null
  dict = null
  dictLoading = false
  dictFailed = false
  registerKernelClient('bellows-voice', () => recs.size)
}

export function __gcSingersForTest(valid: Set<string>): void {
  gcSingers(valid)
}

export function __disposeAllSingersForTest(): void {
  disposeAllSingers()
}
