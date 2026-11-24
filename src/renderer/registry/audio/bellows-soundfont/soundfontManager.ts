/**
 * bellows-soundfont manager: SoundFont 2 (.sf2) instruments on LATCH's shared bellows kernel.
 *
 * A font is fetched (asset id → its URL, or a plain URL) and parsed once with bellows'
 * `SoundFont.parse` (the generator model, stereo links, 24-bit samples), then cached by source so
 * several nodes on one font share it. Each node plays one preset of it as a bellows sampler
 * channel: `samplerBankFromSf2` → `b.samplerInstrument(zones, bankId)`. A bank id is stable per
 * font + preset and registered once per kernel, so switching presets back and forth never
 * re-posts sample data (registerBank carries the audio and is recorded for offline renders).
 *
 * Lifecycle: channels + direct ports are freed on node delete (gc) and engine stop (disposeAll);
 * parsed fonts stay cached across Play/Stop (plain data), capped to the last few fonts.
 */

import type { Bellows, Instrument, SoundFont } from 'bellowsjs'
import { defineLifecycle } from '@/engine/nodeState'
import { assetStorageManager } from '@/services/assets'
import {
  acquireBellows,
  currentBellows,
  kernelGeneration,
  isStaleKernelError,
  registerKernelClient,
  releaseKernelIfIdle,
  releaseDirectPorts,
  routeChannel,
  sharedReverbBus,
} from '@/registry/audio/bellows-instrument/bellowsManager'

export interface SoundfontConfig {
  /** Asset id (uploaded .sf2) or URL; '' = none. */
  source: string
  /** Index into the font's presets, sorted by bank then program. */
  preset: number
  gain: number
  pan: number
  send: number
  attack: number
  release: number
}

export interface PresetEntry {
  bank: number
  program: number
  name: string
}

interface LoadedFont {
  sf: SoundFont
  presets: PresetEntry[]
  key: string
}

type FontState = { status: 'loading'; promise: Promise<LoadedFont> } | { status: 'ready'; font: LoadedFont } | { status: 'error'; error: string }

const MAX_CACHED_FONTS = 4
const fonts = new Map<string, FontState>()
let fontSeq = 0

interface SfRec {
  instrument: Instrument | null
  gen: number
  /** `${fontKey}|${bank}|${program}` the channel plays, '' when none. */
  playing: string
  mix: { gain: number; pan: number; send: number; attack: number; release: number } | null
  heldId: number | null
  polyHeld: number[]
  error: string | null
  booting: boolean
  presetName: string
}

const recs = new Map<string, SfRec>()
/** bank ids registered on the current kernel generation. */
let registered = new Set<string>()
let registeredGen = -1

registerKernelClient('bellows-soundfont', () => recs.size)

function errText(e: unknown): string {
  return String((e as { message?: string })?.message ?? e)
}

const looksLikeUrl = (s: string) => /^(https?:|blob:|data:|\/)/.test(s)

async function fetchFont(source: string): Promise<LoadedFont> {
  const url = looksLikeUrl(source) ? source : await assetStorageManager.getAssetUrl(source)
  if (!url) throw new Error('SoundFont asset not found')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch the SoundFont (${res.status})`)
  const buf = await res.arrayBuffer()
  const { SoundFont } = await import('bellowsjs')
  const sf = SoundFont.parse(buf)
  const presets = sf.presets
    .map((p) => ({ bank: p.bank, program: p.program, name: p.name.trim() || `Preset ${p.bank}:${p.program}` }))
    .sort((a, b) => a.bank - b.bank || a.program - b.program)
  if (presets.length === 0) throw new Error('This SoundFont has no presets')
  return { sf, presets, key: `f${fontSeq++}` }
}

/** The font for a source: ready, or null while loading / on error (state readable via fontState). */
function font(source: string): LoadedFont | null {
  const st = fonts.get(source)
  if (st?.status === 'ready') {
    fonts.delete(source) // refresh LRU position
    fonts.set(source, st)
    return st.font
  }
  if (st) return null
  const promise = fetchFont(source)
  fonts.set(source, { status: 'loading', promise })
  promise
    .then((f) => { if (fonts.get(source)?.status === 'loading') fonts.set(source, { status: 'ready', font: f }) })
    .catch((e) => { fonts.set(source, { status: 'error', error: errText(e) }) })
  while (fonts.size > MAX_CACHED_FONTS) {
    const oldest = fonts.keys().next().value as string
    fonts.delete(oldest)
  }
  return null
}

export function fontError(source: string): string | null {
  const st = fonts.get(source)
  return st?.status === 'error' ? st.error : null
}

export function fontLoading(source: string): boolean {
  return fonts.get(source)?.status === 'loading'
}

export function fontPresets(source: string): PresetEntry[] {
  const st = fonts.get(source)
  return st?.status === 'ready' ? st.font.presets : []
}

function releaseHeld(rec: SfRec): void {
  const inst = rec.instrument
  if (inst) {
    if (rec.heldId != null) { try { inst.off(rec.heldId) } catch { /* ignore */ } }
    for (const id of rec.polyHeld) { try { inst.off(id) } catch { /* ignore */ } }
  }
  rec.heldId = null
  rec.polyHeld = []
}

function retire(rec: SfRec, releaseSeconds: number): void {
  releaseHeld(rec)
  if (rec.instrument) { try { rec.instrument.dispose({ releaseSeconds }) } catch { /* ignore */ } }
  rec.instrument = null
  rec.playing = ''
  rec.mix = null
}

async function samplerBankFromSf2(sf: SoundFont, bank: number, program: number) {
  const mod = await import('bellowsjs')
  return mod.samplerBankFromSf2(sf, bank, program)
}

function bankChannel(b: Bellows, f: LoadedFont, p: PresetEntry, zonesOf: () => Promise<unknown>): Promise<Instrument> {
  const gen = kernelGeneration()
  if (registeredGen !== gen) {
    registered = new Set()
    registeredGen = gen
  }
  const bankId = `sf2-${f.key}-${p.bank}-${p.program}`
  if (registered.has(bankId)) return Promise.resolve(b.voice('sampler:' + bankId))
  return zonesOf().then((bank) => {
    const zones = (bank as { zones: Parameters<Bellows['samplerInstrument']>[0] }).zones
    registered.add(bankId)
    return b.samplerInstrument(zones, bankId)
  })
}

function ensureRec(nodeId: string): SfRec {
  let rec = recs.get(nodeId)
  if (!rec) {
    rec = { instrument: null, gen: -1, playing: '', mix: null, heldId: null, polyHeld: [], error: null, booting: false, presetName: '' }
    recs.set(nodeId, rec)
  }
  return rec
}

/** Per frame: load the font, (re)build the channel on preset change, push the mix. */
export function configureSoundfont(nodeId: string, cfg: SoundfontConfig): void {
  const rec = ensureRec(nodeId)
  if (!cfg.source) {
    if (rec.instrument) retire(rec, 0.5)
    rec.presetName = ''
    rec.error = null
    return
  }
  const f = font(cfg.source)
  if (!f) {
    rec.error = fontError(cfg.source)
    return
  }
  const b = currentBellows()
  if (!b) {
    if (!rec.booting) {
      rec.booting = true
      acquireBellows()
        .then(() => { if (recs.get(nodeId) === rec) rec.booting = false })
        .catch((e) => {
          if (recs.get(nodeId) !== rec) return
          rec.booting = false
          if (!isStaleKernelError(e)) rec.error = errText(e)
        })
    }
    return
  }
  const gen = kernelGeneration()
  if (rec.instrument && rec.gen !== gen) { rec.instrument = null; rec.playing = ''; rec.mix = null }
  const idx = Math.max(0, Math.min(f.presets.length - 1, Math.round(cfg.preset)))
  const p = f.presets[idx]
  rec.presetName = p.name
  const want = `${f.key}|${p.bank}|${p.program}`
  if (rec.playing !== want) {
    retire(rec, 1)
    rec.playing = want // claimed now: the async build below must not start twice
    bankChannel(b, f, p, () => samplerBankFromSf2(f.sf, p.bank, p.program))
      .then((inst) => {
        if (recs.get(nodeId) !== rec || rec.playing !== want || kernelGeneration() !== gen) {
          try { inst.dispose() } catch { /* ignore */ }
          return
        }
        rec.instrument = inst
        rec.gen = gen
        rec.mix = null
        rec.error = null
        applyMix(rec, cfg)
      })
      .catch((e) => {
        if (recs.get(nodeId) !== rec) return
        rec.error = errText(e)
        console.warn('[bellows-soundfont] could not build the preset:', rec.error)
      })
    return
  }
  applyMix(rec, cfg)
}

function applyMix(rec: SfRec, cfg: SoundfontConfig): void {
  const inst = rec.instrument
  if (!inst) return
  const m = rec.mix
  if (!m || m.gain !== cfg.gain) { try { inst.gain(cfg.gain) } catch { /* ignore */ } }
  if (!m || m.pan !== cfg.pan) { try { inst.pan(cfg.pan) } catch { /* ignore */ } }
  if (!m || m.attack !== cfg.attack) { try { inst.param('attack', cfg.attack) } catch { /* ignore */ } }
  if (!m || m.release !== cfg.release) { try { inst.param('release', cfg.release) } catch { /* ignore */ } }
  if (!m || m.send !== cfg.send) {
    const bus = cfg.send > 0 || m ? sharedReverbBus() : null
    if (bus) { try { inst.send(bus, cfg.send) } catch { /* ignore */ } }
  }
  rec.mix = { gain: cfg.gain, pan: cfg.pan, send: cfg.send, attack: cfg.attack, release: cfg.release }
}

export function sfTrigger(nodeId: string, notes: number[], vel: number): void {
  const inst = recs.get(nodeId)?.instrument
  if (!inst) return
  for (const n of notes) { try { inst.note(n, { dur: '8n', vel }) } catch { /* ignore */ } }
}

/** Level gate: hold `notes` while high, release on low. */
export function sfGate(nodeId: string, high: boolean, notes: number[], vel: number): void {
  const rec = recs.get(nodeId)
  const inst = rec?.instrument
  if (!rec || !inst) return
  if (high && rec.polyHeld.length === 0 && notes.length > 0) {
    rec.polyHeld = notes.map((n) => inst.on(n, vel))
  } else if (!high && rec.polyHeld.length > 0) {
    releaseHeld(rec)
  }
}

export function sfRoute(nodeId: string, wired: boolean) {
  return routeChannel(nodeId, recs.get(nodeId)?.instrument ?? null, wired)
}

export function sfStatus(nodeId: string): { presetName: string; error: string | null } {
  const rec = recs.get(nodeId)
  return { presetName: rec?.presetName ?? '', error: rec?.error ?? null }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function gcSoundfonts(valid: Set<string>): void {
  let removed = false
  for (const [id, rec] of [...recs]) {
    if (valid.has(id)) continue
    retire(rec, 1)
    releaseDirectPorts(id)
    recs.delete(id)
    removed = true
  }
  if (removed) releaseKernelIfIdle()
}

function disposeAllSoundfonts(): void {
  for (const [id, rec] of recs) {
    retire(rec, 0)
    releaseDirectPorts(id)
  }
  recs.clear()
  registered = new Set()
  registeredGen = -1
}

defineLifecycle({ label: 'bellows-soundfont', gc: gcSoundfonts, disposeAll: disposeAllSoundfonts })

// ── Test seams ───────────────────────────────────────────────────────────────
export function __resetSoundfontsForTest(): void {
  recs.clear()
  fonts.clear()
  registered = new Set()
  registeredGen = -1
  registerKernelClient('bellows-soundfont', () => recs.size)
}
export function __setFontForTest(source: string, sf: unknown, presets: PresetEntry[]): void {
  fonts.set(source, { status: 'ready', font: { sf: sf as SoundFont, presets, key: 'ftest' } })
}
export function __gcSoundfontsForTest(valid: Set<string>): void {
  gcSoundfonts(valid)
}
