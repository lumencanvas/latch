import type { Bellows, Instrument, FxInput } from 'bellowsjs'
import { defineLifecycle } from '@/engine/nodeState'
import {
  acquireBellows, currentBellows, isStaleKernelError, kernelGeneration, registerKernelClient,
  releaseDirectPorts, releaseKernelIfIdle, routeChannel, sharedReverbBus,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import { compose, PARTS, styleOf, type ComposeOptions, type Part, type Piece } from './composer'

/**
 * Plays a composed piece on the shared bellows kernel: one bellows instrument per part, scheduled
 * sample-accurately from bellows' clock, arranged live by energy (parts enter as it rises), and
 * reporting what just sounded so a flow can draw to it.
 */

export interface WorkstationConfig extends ComposeOptions {
  seed: string
  playing: boolean
  /** -1 … 1 shifts every section's energy; 0 plays the form as written. */
  energy: number
  mutes: Partial<Record<Part, boolean>>
  level: number
  reverb: number
}

export interface Hit { part: Part; midi: number; vel: number; t: number }

interface Rec {
  gen: number
  b: Bellows | null
  booting: boolean
  error: string | null
  sounds: string
  inst: Partial<Record<Part, Instrument>>
  unsub: (() => void) | null
  pieceKey: string
  piece: Piece | null
  cfg: WorkstationConfig | null
  cycle: number
  bar: number
  step: number
  /** Scheduled ahead by the clock; handed to the flow once their time comes. */
  pending: Hit[]
  wired: boolean
  /** Last bass and lead notes heard, held between notes. */
  lastBass: number
  lastLead: number
}

const recs = new Map<string, Rec>()
/** How many times New Seed was pressed per node (seed, seed+1, seed+2 …). */
const seedBumps = new Map<string, number>()

export function bumpSeed(nodeId: string): void {
  seedBumps.set(nodeId, (seedBumps.get(nodeId) ?? 0) + 1)
}
export function seedBumpOf(nodeId: string): number {
  return seedBumps.get(nodeId) ?? 0
}
registerKernelClient('bellows-workstation', () => [...recs.values()].filter((r) => r.unsub).length)

const newRec = (): Rec => ({
  gen: -1, b: null, booting: false, error: null, sounds: '', inst: {}, unsub: null, pieceKey: '', piece: null,
  cfg: null, cycle: 0, bar: 0, step: 0, pending: [], wired: false, lastBass: 0, lastLead: 0,
})

function errText(e: unknown): string {
  return String((e as { message?: string })?.message ?? e)
}

function disposeInstruments(rec: Rec, releaseSeconds: number): void {
  for (const inst of Object.values(rec.inst)) { try { inst?.dispose({ releaseSeconds }) } catch { /* ignore */ } }
  rec.inst = {}
  rec.sounds = ''
}

function stopClock(rec: Rec): void {
  rec.unsub?.()
  rec.unsub = null
  rec.pending = []
  if (![...recs.values()].some((r) => r.unsub)) { try { currentBellows()?.stop() } catch { /* ignore */ } }
}

async function buildInstruments(rec: Rec, b: Bellows, styleId: string): Promise<void> {
  const mod = await import('bellowsjs')
  disposeInstruments(rec, 0.5)
  const style = styleOf(styleId)
  const bus = sharedReverbBus()
  for (const part of PARTS) {
    const id = style.sound[part]
    try {
      let inst: Instrument
      let preset = null
      try { preset = mod.getPreset(id) } catch { preset = null }
      if (preset) {
        inst = b.voice(preset.engineId, { ...(preset.params ?? {}) })
        const fx = (preset.fx ?? []).map((f) => (f.params ? ([f.effectId, f.params] as [string, Record<string, number>]) : f.effectId)) as FxInput[]
        if (fx.length) inst.fx(...fx)
        if (preset.gain !== undefined) inst.gain(preset.gain)
      } else {
        inst = b.voice(id)
      }
      if (bus && part !== 'kick' && part !== 'bass') inst.send(bus, part === 'chords' || part === 'lead' ? 0.35 : 0.2)
      rec.inst[part] = inst
    } catch (e) {
      console.warn(`[workstation] no ${part} voice (${id}):`, e)
    }
  }
  rec.sounds = styleId
}

/** Seconds in one 16th at the piece's tempo. */
const sixteenth = (bpm: number) => 60 / bpm / 4

function tick(rec: Rec, t: number): void {
  const piece = rec.piece
  const cfg = rec.cfg
  if (!piece || !cfg) return
  const bar = piece.bars[rec.bar]
  const s = rec.step
  const style = styleOf(piece.style)
  const energy = Math.max(0, Math.min(1.2, bar.energy + cfg.energy * 0.5))
  const len = sixteenth(piece.bpm)
  for (const e of bar.events) {
    if (e.step !== s || cfg.mutes[e.part] || energy < style.enter[e.part]) continue
    const inst = rec.inst[e.part]
    if (!inst) continue
    const vel = Math.min(1, e.vel * (0.75 + energy * 0.3) * cfg.level)
    try { inst.note(e.midi, { at: t, dur: { seconds: e.len * len * 0.95 }, vel }) } catch { /* a dead kernel; the next config rebuilds */ }
    rec.pending.push({ part: e.part, midi: e.midi, vel, t })
  }
  if (rec.pending.length > 256) rec.pending.splice(0, rec.pending.length - 256)
  // Advance: 16 steps a bar, then the next bar of the form; a new cycle varies the details.
  if (++rec.step >= 16) {
    rec.step = 0
    if (++rec.bar >= piece.bars.length) {
      rec.bar = 0
      rec.cycle++
      rec.piece = compose(cfg.seed, cfg, rec.cycle)
    }
  }
}

function startClock(rec: Rec, b: Bellows): void {
  if (rec.unsub || !rec.piece) return
  b.bpm(rec.piece.bpm)
  b.swing(rec.piece.swing, '8n')
  rec.step = 0
  rec.unsub = b.clock.at('16n', (t) => tick(rec, t))
  try { b.start() } catch { /* already running */ }
}

/** Push this frame's settings; boots the kernel and instruments on first play. */
export function configureWorkstation(nodeId: string, cfg: WorkstationConfig): void {
  let rec = recs.get(nodeId)
  if (!rec) { rec = newRec(); recs.set(nodeId, rec) }
  const gen = kernelGeneration()
  if (rec.gen !== gen) { rec.unsub = null; rec.inst = {}; rec.sounds = ''; rec.b = null; rec.gen = gen }
  rec.cfg = cfg

  const pieceKey = JSON.stringify([cfg.seed, cfg.style, cfg.key, cfg.scale, cfg.bpm])
  if (pieceKey !== rec.pieceKey) {
    rec.pieceKey = pieceKey
    rec.cycle = 0
    rec.bar = 0
    rec.piece = compose(cfg.seed, cfg, 0)
    if (rec.b && rec.unsub) { rec.b.bpm(rec.piece.bpm); rec.b.swing(rec.piece.swing, '8n') }
  }

  if (!cfg.playing) { if (rec.unsub) stopClock(rec); return }
  if (rec.b && rec.sounds === (cfg.style ?? 'lofi')) { startClock(rec, rec.b); return }
  if (rec.booting) return
  rec.booting = true
  const r = rec
  acquireBellows()
    .then(async (b) => {
      if (recs.get(nodeId) !== r) return
      r.b = b
      r.gen = kernelGeneration()
      await buildInstruments(r, b, cfg.style ?? 'lofi')
      for (const inst of Object.values(r.inst)) routeChannel(nodeId, inst ?? null, r.wired)
      r.error = null
      if (r.cfg?.playing) startClock(r, b)
    })
    .catch((e) => { if (!isStaleKernelError(e)) r.error = errText(e) })
    .finally(() => { r.booting = false })
}

/** Route every part to the node's audio output when it is wired, else to the master. */
export function routeWorkstation(nodeId: string, wired: boolean) {
  const rec = recs.get(nodeId)
  if (!rec) return null
  rec.wired = wired
  let out = null
  for (const inst of Object.values(rec.inst)) out = routeChannel(nodeId, inst ?? null, wired) ?? out
  return out
}

/** Notes whose time has come (taken once), and where the piece is. */
export function readWorkstation(nodeId: string, now: number) {
  const rec = recs.get(nodeId)
  if (!rec?.piece) return null
  const due = rec.pending.filter((h) => h.t <= now)
  if (due.length) rec.pending = rec.pending.filter((h) => h.t > now)
  for (const h of due) {
    if (h.part === 'bass') rec.lastBass = h.midi
    if (h.part === 'lead') rec.lastLead = h.midi
  }
  // The clock runs ahead of the speakers, so report the bar that is audible, not scheduled.
  const bar = rec.piece.bars[rec.bar]
  return { due, piece: rec.piece, bar, barIndex: rec.bar, lastBass: rec.lastBass, lastLead: rec.lastLead, cycle: rec.cycle, playing: !!rec.unsub, error: rec.error }
}

function retire(id: string, rec: Rec, releaseSeconds: number): void {
  stopClock(rec)
  disposeInstruments(rec, releaseSeconds)
  releaseDirectPorts(id)
}

function gcWorkstations(valid: Set<string>): void {
  let removed = false
  for (const [id, rec] of [...recs]) {
    if (valid.has(id)) continue
    retire(id, rec, 1)
    recs.delete(id)
    seedBumps.delete(id)
    removed = true
  }
  if (removed) releaseKernelIfIdle()
}

function disposeAllWorkstations(): void {
  for (const [id, rec] of recs) retire(id, rec, 0)
  recs.clear()
  seedBumps.clear()
}

defineLifecycle({ label: 'bellows-workstation', gc: gcWorkstations, disposeAll: disposeAllWorkstations })

export function __resetWorkstationsForTest(): void {
  recs.clear()
  seedBumps.clear()
}
