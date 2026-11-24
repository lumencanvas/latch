/**
 * bellows-granular manager: any audio file as a bellows granular instrument on the shared
 * kernel. The file (asset id or URL) is decoded once, mixed to mono and capped in length, then
 * handed to `b.granular(data, sampleRate, params)`. bellows registers the buffer under an engine
 * id (`granular:grainN`) that is kept per source per kernel, so a second node on the same file,
 * or a rebuild, reuses it with `b.voice(engineId)` instead of posting the samples again.
 *
 * Params (grain size, density, position, spray, pitch…) are channel params: they change live with
 * `inst.param` and glide with `rampParam` for continuous ones.
 */

import type { Instrument } from 'bellowsjs'
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

/** Longest source kept (seconds): grains read anywhere in it, and it is copied into the kernel. */
const MAX_SECONDS = 60
const RAMP_SECONDS = 0.03
const STEPPED = new Set(['reverse', 'baseNote'])

interface Decoded { data: Float32Array; sampleRate: number; seconds: number }
type SourceState = { status: 'loading' } | { status: 'ready'; audio: Decoded } | { status: 'error'; error: string }

const sources = new Map<string, SourceState>()
/** source → engine id registered on the current kernel generation. */
let engines = new Map<string, string>()
let enginesGen = -1

export interface GranularConfig {
  source: string
  params: Record<string, number>
  gain: number
  pan: number
  send: number
}

interface GrRec {
  instrument: Instrument | null
  gen: number
  source: string
  params: Record<string, number>
  mix: { gain: number; pan: number; send: number } | null
  held: number[]
  booting: boolean
  error: string | null
}

const recs = new Map<string, GrRec>()
registerKernelClient('bellows-granular', () => recs.size)

const errText = (e: unknown) => String((e as { message?: string })?.message ?? e)
const looksLikeUrl = (s: string) => /^(https?:|blob:|data:|\/)/.test(s)

async function decode(source: string): Promise<Decoded> {
  const url = looksLikeUrl(source) ? source : await assetStorageManager.getAssetUrl(source)
  if (!url) throw new Error('Audio asset not found')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch the audio (${res.status})`)
  const buf = await res.arrayBuffer()
  const ctx = new OfflineAudioContext(1, 1, 48000)
  const audio = await ctx.decodeAudioData(buf)
  const n = Math.min(audio.length, Math.floor(MAX_SECONDS * audio.sampleRate))
  const mono = new Float32Array(n)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels
  }
  return { data: mono, sampleRate: audio.sampleRate, seconds: n / audio.sampleRate }
}

function sourceAudio(source: string): Decoded | null {
  const st = sources.get(source)
  if (st?.status === 'ready') return st.audio
  if (st) return null
  sources.set(source, { status: 'loading' })
  decode(source)
    .then((audio) => sources.set(source, { status: 'ready', audio }))
    .catch((e) => sources.set(source, { status: 'error', error: errText(e) }))
  while (sources.size > 6) sources.delete(sources.keys().next().value as string)
  return null
}

export function granularSourceState(source: string): { loading: boolean; seconds: number; error: string | null } {
  const st = sources.get(source)
  return {
    loading: st?.status === 'loading',
    seconds: st?.status === 'ready' ? st.audio.seconds : 0,
    error: st?.status === 'error' ? st.error : null,
  }
}

function releaseHeld(rec: GrRec): void {
  if (rec.instrument) for (const id of rec.held) { try { rec.instrument.off(id) } catch { /* ignore */ } }
  rec.held = []
}

function retire(rec: GrRec, releaseSeconds: number): void {
  releaseHeld(rec)
  if (rec.instrument) { try { rec.instrument.dispose({ releaseSeconds }) } catch { /* ignore */ } }
  rec.instrument = null
  rec.source = ''
  rec.mix = null
  rec.params = {}
}

export function configureGranular(nodeId: string, cfg: GranularConfig): void {
  let rec = recs.get(nodeId)
  if (!rec) {
    rec = { instrument: null, gen: -1, source: '', params: {}, mix: null, held: [], booting: false, error: null }
    recs.set(nodeId, rec)
  }
  if (!cfg.source) {
    if (rec.instrument) retire(rec, 0.5)
    rec.error = null
    return
  }
  const audio = sourceAudio(cfg.source)
  if (!audio) {
    rec.error = granularSourceState(cfg.source).error
    return
  }
  const b = currentBellows()
  if (!b) {
    if (!rec.booting) {
      rec.booting = true
      const r = rec
      acquireBellows()
        .then(() => { if (recs.get(nodeId) === r) r.booting = false })
        .catch((e) => {
          if (recs.get(nodeId) !== r) return
          r.booting = false
          if (!isStaleKernelError(e)) r.error = errText(e)
        })
    }
    return
  }
  const gen = kernelGeneration()
  if (enginesGen !== gen) { engines = new Map(); enginesGen = gen }
  if (rec.instrument && (rec.gen !== gen || rec.source !== cfg.source)) {
    retire(rec, rec.gen === gen ? 1 : 0)
  }
  if (!rec.instrument) {
    try {
      const known = engines.get(cfg.source)
      const inst = known ? b.voice(known, cfg.params) : b.granular(audio.data, audio.sampleRate, cfg.params)
      if (!known && inst.engineId) engines.set(cfg.source, inst.engineId)
      rec.instrument = inst
      rec.gen = gen
      rec.source = cfg.source
      rec.params = { ...cfg.params }
      rec.mix = null
      rec.error = null
    } catch (e) {
      rec.error = errText(e)
      return
    }
  }
  const inst = rec.instrument
  for (const [name, value] of Object.entries(cfg.params)) {
    if (rec.params[name] === value) continue
    try {
      if (STEPPED.has(name)) inst.param(name, value)
      else inst.rampParam(name, value, { seconds: RAMP_SECONDS })
    } catch { /* ignore */ }
    rec.params[name] = value
  }
  const m = rec.mix
  if (!m || m.gain !== cfg.gain) { try { inst.gain(cfg.gain) } catch { /* ignore */ } }
  if (!m || m.pan !== cfg.pan) { try { inst.pan(cfg.pan) } catch { /* ignore */ } }
  if (!m || m.send !== cfg.send) {
    const bus = cfg.send > 0 || m ? sharedReverbBus() : null
    if (bus) { try { inst.send(bus, cfg.send) } catch { /* ignore */ } }
  }
  rec.mix = { gain: cfg.gain, pan: cfg.pan, send: cfg.send }
}

export function granularTrigger(nodeId: string, notes: number[], vel: number, dur: number): void {
  const inst = recs.get(nodeId)?.instrument
  if (!inst) return
  for (const n of notes) { try { inst.note(n, { dur: { seconds: dur }, vel }) } catch { /* ignore */ } }
}

export function granularGate(nodeId: string, high: boolean, notes: number[], vel: number): void {
  const rec = recs.get(nodeId)
  const inst = rec?.instrument
  if (!rec || !inst) return
  if (high && rec.held.length === 0 && notes.length) rec.held = notes.map((n) => inst.on(n, vel))
  else if (!high && rec.held.length) releaseHeld(rec)
}

export function granularRoute(nodeId: string, wired: boolean) {
  return routeChannel(nodeId, recs.get(nodeId)?.instrument ?? null, wired)
}

export function granularError(nodeId: string): string | null {
  return recs.get(nodeId)?.error ?? null
}

function gcGranular(valid: Set<string>): void {
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

function disposeAllGranular(): void {
  for (const [id, rec] of recs) { retire(rec, 0); releaseDirectPorts(id) }
  recs.clear()
  engines = new Map()
  enginesGen = -1
}

defineLifecycle({ label: 'bellows-granular', gc: gcGranular, disposeAll: disposeAllGranular })

export function __resetGranularForTest(): void {
  recs.clear()
  sources.clear()
  engines = new Map()
  enginesGen = -1
  registerKernelClient('bellows-granular', () => recs.size)
}
export function __setGranularSourceForTest(source: string, data: Float32Array, sampleRate: number): void {
  sources.set(source, { status: 'ready', audio: { data, sampleRate, seconds: data.length / sampleRate } })
}
