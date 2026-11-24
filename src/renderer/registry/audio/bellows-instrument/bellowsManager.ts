/**
 * Bellows kernel manager (Thread D).
 *
 * bellowsjs boots one AudioWorklet kernel that hosts every voice; there is NO free
 * Web-Audio graph out of it — the only boundary node is `b.analyser`. So LATCH shares
 * ONE kernel per session: each `bellows-instrument` / `poly-voice` node is a `b.voice()`,
 * and the shared kernel output is routed ONCE into LATCH's master gain (so master volume /
 * meter / recording capture it). Individual nodes therefore have no wireable audio-output
 * port — they play straight through the shared kernel into master. (Per-node wireable
 * outputs would need a kernel per node; deferred.)
 *
 * Topology (verified against dist/bellows.js): `workletNode → analyser → ctx.destination`.
 * We detach the analyser from `destination` and reroute it into LATCH's master.
 *
 * bellowsjs is loaded via a dynamic `import()` so its DSP core + worklet land in a lazy
 * chunk — zero cost until the first bellows node runs.
 *
 * Lifecycle mirrors the audio category: per-node voice state is GC'd when a node is removed
 * and the whole kernel is disposed on engine stop (the repo's recurring leak class).
 */

import { audioManager, Tone } from '@/services/audio/AudioManager'
import { defineLifecycle } from '@/engine/nodeState'
import type { Bellows, Instrument, BusHandle, InstrumentPreset, FxInput } from 'bellowsjs'
import {
  type VoiceConfig,
  computeParamUpdates,
  computeParamRemovals,
  sameParams,
  isSteppedParam,
  paramDefault,
  INSERT_FX_OPTIONS,
} from './engineParams'

type BellowsModule = typeof import('bellowsjs')
type VoicePluginModule = typeof import('bellows-voice')

/**
 * How long a retired channel (engine/preset swap, node delete) keeps ringing before bellows
 * frees it — `Instrument.dispose({ releaseSeconds })` releases held notes then defers the
 * removal, so a swap crossfades instead of clicking and nothing leaks.
 */
export const RETIRE_RELEASE_SECONDS = 2
/** Glide time for a live manual param change — long enough to kill zipper noise, short enough to feel immediate. */
export const PARAM_RAMP_SECONDS = 0.03

/** Most one-shots replayed after boot (the boot window is ~100 ms; more would be a stale burst). */
const MAX_PENDING_NOTES = 16

// ── Shared kernel singleton ──────────────────────────────────────────────────
let bellowsInstance: Bellows | null = null
let bellowsModule: BellowsModule | null = null
let bootPromise: Promise<Bellows> | null = null
/**
 * A silent Tone source parked on LATCH's master while the kernel lives. Tone's
 * standardized-audio-context only keeps a node natively wired to the speakers while it sees an
 * ACTIVE input; bellows feeds master from a native node it can't see, so on its own master
 * stayed unplugged and bellows was silent unless some Tone node happened to be playing
 * (every bellows-only flow — e.g. the "Chords & Arpeggio" starter — made no sound).
 */
let masterKeepAlive: Tone.Signal | null = null
/** Shared reverb send bus, created lazily on the first node that requests a send. */
let reverbBus: BusHandle | null = null
/**
 * Bumped on every kernel disposal. A boot captures the generation it started in; if the
 * kernel was disposed while it was in flight (Stop → Play during the async boot), the boot is
 * stale — it disposes the kernel it just made instead of installing it.
 */
let kernelGen = 0
/** The bellows-voice plugin load for the current kernel generation (lazy; only singers pay). */
let voicePluginPromise: Promise<VoicePluginHandle> | null = null
let voicePluginGen = -1

/** Thrown into a boot that was superseded by a disposal; never surfaced as a node error. */
class StaleKernelError extends Error {
  constructor() { super('bellows: kernel disposed while booting') }
}

const INSERT_FX_IDS = new Set(INSERT_FX_OPTIONS.map((o) => o.value).filter(Boolean))

/** Snapshot of what has actually been pushed to the kernel for a node (for per-frame diffing). */
interface AppliedConfig {
  preset: string
  engine: string
  params: Record<string, number>
  insertFx: string | null
  fxParams: Record<string, number>
  send: number
  /** Effective channel gain pushed (user Level × the preset's own trim in preset mode). */
  gain: number
  pan: number
}

interface NodeVoice {
  instrument: Instrument | null
  /** Engine of the currently-allocated voice channel. */
  engine: string
  /** Mono gate held-note id (bellows-instrument), or null. */
  heldId: number | null
  /** Poly gate held-note ids (poly-voice). */
  polyHeld: number[]
  /** Last config pushed to the kernel; null until the first apply. */
  applied: AppliedConfig | null
  /** Latest desired config while the kernel is still booting (applied on boot). */
  pendingConfig: VoiceConfig | null
  error: string | null
  /** Kernel + engine|preset target whose channel allocation last failed (no per-frame retry). */
  failedAlloc?: { b: Bellows; target: string }
  /** One-shot notes triggered while the kernel was still booting; replayed on boot. */
  pending?: { note: number; vel: number; dur: string }[]
  /** Waiting on the shared kernel boot. */
  booting: boolean
}

const voices = new Map<string, NodeVoice>()

/**
 * Other modules that hold channels on the shared kernel (the bellows-voice singer nodes). The
 * kernel is torn down on GC only when NO client still has live work on it.
 */
const kernelClients = new Map<string, () => number>()

/** Recover the native BaseAudioContext that Tone's standardized-audio-context wraps. */
function nativeContextOf(rawContext: unknown): AudioContext | null {
  if (rawContext instanceof BaseAudioContext) return rawContext as AudioContext
  const w = rawContext as { _nativeContext?: unknown; _nativeAudioContext?: unknown }
  const cand = w?._nativeContext ?? w?._nativeAudioContext
  return cand instanceof BaseAudioContext ? (cand as AudioContext) : null
}

/** Native AudioNode behind a Tone node (standardized-audio-context wrapped). */
function nativeNodeOf(input: unknown): AudioNode | null {
  if (input instanceof AudioNode) return input
  const w = input as { _nativeAudioNode?: unknown; input?: unknown }
  if (w?._nativeAudioNode instanceof AudioNode) return w._nativeAudioNode
  const inner = w?.input
  // Tone.Gain's `.input` IS the native GainNode (no _nativeAudioNode wrapper).
  if (inner instanceof AudioNode) return inner
  const innerWrapped = inner as { _nativeAudioNode?: unknown } | undefined
  if (innerWrapped?._nativeAudioNode instanceof AudioNode) return innerWrapped._nativeAudioNode
  return null
}

/**
 * Boot the shared kernel on LATCH's native AudioContext and route its output into
 * LATCH's master gain. Idempotent: concurrent callers share one boot promise. A boot that is
 * overtaken by a disposal (Stop during the async window) disposes its own kernel and rejects
 * with a StaleKernelError, so no orphaned worklet survives and no stale kernel is installed.
 */
async function getBellows(): Promise<Bellows> {
  if (bellowsInstance) return bellowsInstance
  if (bootPromise) return bootPromise

  const gen = kernelGen
  const p = (async () => {
    // Reuse LATCH's gesture-unlocked context (the engine only runs post-Play).
    await audioManager.initialize()
    const nativeCtx = nativeContextOf(Tone.getContext().rawContext as unknown)
    if (!nativeCtx) throw new Error('bellows: could not recover native AudioContext from Tone wrapper')

    // Lazy chunk — bellows' DSP core + worklet stay out of the main bundle.
    const mod = await import('bellowsjs')
    if (gen !== kernelGen) throw new StaleKernelError()
    // We pass Tone's context, so bellows' dispose() leaves it open (closeContextOnDispose
    // defaults false for a caller-supplied context).
    const b = await mod.Bellows.boot({ context: nativeCtx })
    if (gen !== kernelGen) {
      try { b.dispose() } catch { /* ignore */ }
      throw new StaleKernelError()
    }

    // bellows wires kernel -> analyser -> ctx.destination; detach the analyser from
    // destination and reroute it into LATCH's master so master volume/meter see it.
    // The analyser is a truly-native node, so Tone.connect (standardized-audio-context)
    // may reject it — fall back to a native connect onto master's underlying node.
    b.analyser.disconnect()
    const master = audioManager.getMasterOutput()
    try {
      Tone.connect(b.analyser as unknown as AudioNode, master)
    } catch {
      const masterNative = nativeNodeOf(master)
      if (masterNative) b.analyser.connect(masterNative)
    }
    try {
      masterKeepAlive?.dispose()
      masterKeepAlive = new Tone.Signal(0).connect(master)
    } catch (e) {
      // Non-fatal: without it bellows may be silent until a Tone node plays — say so.
      masterKeepAlive = null
      console.warn('[bellows] master keep-alive failed; bellows may be silent:', e)
    }

    bellowsModule = mod
    bellowsInstance = b
    return b
  })()
  bootPromise = p
  // A failed boot must not wedge the singleton: clear it so a later node can retry.
  p.catch(() => { if (bootPromise === p) bootPromise = null })
  return p
}

/** The shared reverb send bus (FDN), created once per kernel. */
function ensureReverbBus(b: Bellows): BusHandle | null {
  if (!reverbBus) {
    try {
      reverbBus = b.bus(['fdn'], { level: 0.4 })
    } catch {
      reverbBus = null
    }
  }
  return reverbBus
}

/** Build the FxInput list bellows' `inst.fx(...)` expects from an insert-fx id (or clear). */
function insertFxArgs(id: string | null, params: Record<string, number>): FxInput[] {
  if (!id || !INSERT_FX_IDS.has(id)) return []
  return Object.keys(params).length > 0 ? [[id, params]] : [id]
}

/** Resolve a preset id to its full bellows preset via the loaded module, or null. */
function lookupPreset(presetId: string): InstrumentPreset | null {
  try {
    return bellowsModule?.getPreset(presetId) ?? null
  } catch {
    return null // getPreset throws on an unknown id
  }
}

/** A preset's insert chain in `inst.fx(...)` form. */
function presetFx(preset: InstrumentPreset): FxInput[] {
  return (preset.fx ?? []).map((f) =>
    f.params ? ([f.effectId, f.params] as [string, Record<string, number>]) : f.effectId,
  )
}

/**
 * Engine default for a param from the live catalog (covers array-expanded names like ratio2
 * that the static table omits), falling back to the static table.
 */
const catalogDefaults = new Map<string, Map<string, number>>()
function engineDefault(engine: string, name: string): number | undefined {
  let table = catalogDefaults.get(engine)
  if (!table && bellowsModule) {
    try {
      const info = bellowsModule.listEngines().find((e) => e.id === engine)
      if (info) {
        table = new Map(info.params.map((p) => [p.name, p.default]))
        catalogDefaults.set(engine, table)
      }
    } catch { /* fall through to the static table */ }
  }
  return table?.get(name) ?? paramDefault(engine, name)
}

/** Free a record's channel: release held notes and let its tail ring out before removal. */
function retireInstrument(rec: NodeVoice, releaseSeconds = RETIRE_RELEASE_SECONDS): void {
  releaseHeld(rec)
  const inst = rec.instrument
  rec.instrument = null
  if (inst) {
    try { inst.dispose({ releaseSeconds }) } catch { /* ignore */ }
  }
}

/**
 * Push a resolved config onto the node's channel, diffing against the last-applied snapshot so
 * a steady frame is a no-op.
 *
 * A FRESH channel is allocated whenever the engine OR the preset id changes (manual counts as
 * preset ''), created directly with its target engine and initial params via
 * `b.voice(engine, params)`. That makes every timbre switch start from engine defaults — a
 * preset never inherits a previous preset's or the manual panel's leftover values, and a
 * preset-mode node never boots a throwaway channel on the wrong engine. The outgoing channel
 * is disposed with a release tail (no leak, no click).
 *
 * Within one manual channel, changed continuous params glide (`rampParam`, no zipper noise),
 * mode-index params step, and params that disappear (a deleted raw override) are pushed back
 * to the engine default — the kernel otherwise keeps the last value it was sent.
 */
function applyConfig(rec: NodeVoice, cfg: VoiceConfig): void {
  const b = bellowsInstance
  if (!b) return
  const preset = cfg.preset ? lookupPreset(cfg.preset) : null
  // An id the loaded bellows doesn't know (shouldn't happen — resolveVoiceConfig validates
  // against the same table) degrades to manual rather than silence.
  const presetId = preset ? cfg.preset : ''
  const targetEngine = preset ? preset.engineId : cfg.engine

  const prev = rec.applied
  if (!rec.instrument || !prev || rec.engine !== targetEngine || prev.preset !== presetId) {
    // A failed allocation is retried only when the target (or the kernel) changes — not per frame.
    const target = `${targetEngine}|${presetId}`
    const failed = rec.failedAlloc
    if (!rec.instrument && rec.error && failed && failed.b === b && failed.target === target) return
    retireInstrument(rec)
    const initial = preset ? { ...(preset.params ?? {}) } : { ...cfg.params }
    try {
      rec.instrument = b.voice(targetEngine, initial)
    } catch (e) {
      rec.error = String((e as { message?: string })?.message ?? e)
      rec.failedAlloc = { b, target }
      console.warn(`[bellows] could not create a ${targetEngine} voice${presetId ? ` (preset ${presetId})` : ''}:`, rec.error)
      return
    }
    rec.failedAlloc = undefined
    rec.engine = targetEngine
    rec.applied = null
  }
  const live = rec.instrument!
  const applied = rec.applied

  if (preset) {
    // Preset owns timbre: params went in at creation; set its insert chain once.
    if (!applied) {
      const fx = presetFx(preset)
      if (fx.length > 0) { try { live.fx(...fx) } catch { /* ignore */ } }
    }
  } else {
    if (applied) {
      for (const name of computeParamRemovals(applied.params, cfg.params)) {
        const def = engineDefault(targetEngine, name)
        if (def !== undefined) { try { live.param(name, def) } catch { /* ignore */ } }
      }
      for (const [name, value] of computeParamUpdates(applied.params, cfg.params)) {
        try {
          if (isSteppedParam(targetEngine, name)) live.param(name, value)
          else live.rampParam(name, value, { seconds: PARAM_RAMP_SECONDS })
        } catch { /* unknown param name → ignored by kernel */ }
      }
    }
    // Insert chain: (re)build on id change; nudge individual fx params in place otherwise
    // (rebuilding would flush a delay/reverb tail on every keystroke).
    if (!applied) {
      if (cfg.insertFx) { try { live.fx(...insertFxArgs(cfg.insertFx, cfg.fxParams)) } catch { /* ignore */ } }
    } else if (applied.insertFx !== cfg.insertFx) {
      try { live.fx(...insertFxArgs(cfg.insertFx, cfg.fxParams)) } catch { /* ignore */ }
    } else if (cfg.insertFx && !sameParams(applied.fxParams, cfg.fxParams)) {
      if (computeParamRemovals(applied.fxParams, cfg.fxParams).length > 0) {
        try { live.fx(...insertFxArgs(cfg.insertFx, cfg.fxParams)) } catch { /* ignore */ }
      } else {
        for (const [name, value] of computeParamUpdates(applied.fxParams, cfg.fxParams)) {
          try { live.fxParam(0, name, value) } catch { /* ignore */ }
        }
      }
    }
  }

  // Send / level / pan always apply (user trim, independent of preset). On a preset, Level
  // scales the preset's own channel trim (default 0.8), so Level 0.8 = the preset as voiced.
  const gain = preset ? cfg.gain * ((preset.gain ?? 0.8) / 0.8) : cfg.gain
  if (!applied || applied.send !== cfg.send) {
    const bus = cfg.send > 0 ? ensureReverbBus(b) : reverbBus
    if (bus) { try { live.send(bus, cfg.send) } catch { /* ignore */ } }
  }
  if (!applied || applied.gain !== gain) { try { live.gain(gain) } catch { /* ignore */ } }
  if (!applied || applied.pan !== cfg.pan) { try { live.pan(cfg.pan) } catch { /* ignore */ } }

  rec.applied = {
    preset: presetId,
    engine: targetEngine,
    params: preset ? {} : cfg.params,
    insertFx: preset ? null : cfg.insertFx,
    fxParams: preset ? {} : cfg.fxParams,
    send: cfg.send,
    gain,
    pan: cfg.pan,
  }
  rec.error = null
}

/** Release any mono/poly held notes on a record's instrument (best-effort). */
function releaseHeld(rec: NodeVoice): void {
  const inst = rec.instrument
  if (inst) {
    if (rec.heldId != null) { try { inst.off(rec.heldId) } catch { /* ignore */ } }
    for (const id of rec.polyHeld) { try { inst.off(id) } catch { /* ignore */ } }
  }
  rec.heldId = null
  rec.polyHeld = []
}

// ── Public per-node API ──────────────────────────────────────────────────────
/**
 * Wait for the shared kernel on behalf of a record, then voice it with the latest config
 * captured meanwhile and replay queued one-shots.
 */
function awaitBoot(nodeId: string, rec: NodeVoice): void {
  rec.booting = true
  getBellows()
    .then((b) => {
      // Record identity, not just presence: a Stop→Play during boot replaces the record, and
      // the stale continuation must not voice (or replay notes onto) the new one.
      if (voices.get(nodeId) !== rec || b !== bellowsInstance) return
      rec.booting = false
      const want = rec.pendingConfig
      rec.pendingConfig = null
      // Allocates the channel straight on the target engine (a preset's own, not a 'va' stub).
      if (want) applyConfig(rec, want)
      // Replay one-shots queued during the async boot window so the first hit isn't lost.
      if (rec.pending && rec.instrument) {
        for (const p of rec.pending) {
          try { rec.instrument.note(p.note, { dur: p.dur, vel: p.vel }) } catch { /* ignore */ }
        }
      }
      rec.pending = undefined
    })
    .catch((e) => {
      if (voices.get(nodeId) !== rec) return
      rec.booting = false
      if (!(e instanceof StaleKernelError)) {
        rec.error = String((e as { message?: string })?.message ?? e)
        console.warn('[bellows] engine failed to start:', rec.error)
      }
    })
}

/**
 * Idempotently ensure the node's voice and push its resolved config. Boot-safe: while the
 * kernel is still booting the config is stashed and applied on boot. Call once per frame.
 */
export function configureVoice(nodeId: string, cfg: VoiceConfig): void {
  let rec = voices.get(nodeId)
  if (!rec) {
    rec = {
      instrument: null,
      engine: cfg.engine,
      heldId: null,
      polyHeld: [],
      applied: null,
      pendingConfig: null,
      error: null,
      booting: false,
    }
    voices.set(nodeId, rec)
  }
  if (bellowsInstance && !rec.booting) {
    applyConfig(rec, cfg)
    return
  }
  rec.pendingConfig = cfg
  // Kick (or re-kick, after a kernel GC) the boot; a failed boot stays failed for this record
  // until the node is recreated or the engine restarts — never a retry storm per frame.
  if (!rec.booting && !rec.error) awaitBoot(nodeId, rec)
}

/** The live voice record for a node, or null while still booting / on error. */
export function getVoice(nodeId: string): NodeVoice | null {
  const rec = voices.get(nodeId)
  return rec?.instrument ? rec : null
}

/** Last kernel/boot error for a node, or null. */
export function getVoiceError(nodeId: string): string | null {
  return voices.get(nodeId)?.error ?? null
}

/**
 * Play a one-shot note now, or QUEUE it if the shared kernel is still booting (replayed on
 * the first frame after boot) — so a trigger firing during the async boot window isn't
 * dropped. No-op until the node has a voice record (call configureVoice first).
 */
/** Surface a bellows failure once per voice + kind (a silent catch hid every failure). */
function warnOnce(rec: object, kind: string, e: unknown): void {
  const seen = (warned.get(rec) ?? new Set<string>())
  if (seen.has(kind)) return
  seen.add(kind)
  warned.set(rec, seen)
  console.warn(`[bellows] ${kind} failed:`, (e as { message?: string })?.message ?? e)
}
const warned = new WeakMap<object, Set<string>>()

export function queueNote(nodeId: string, note: number, vel: number, dur = '8n'): void {
  const rec = voices.get(nodeId)
  if (!rec) return
  if (rec.instrument) {
    try { rec.instrument.note(note, { dur, vel }) } catch (e) { warnOnce(rec, 'note', e) }
  } else if (!rec.error) {
    const q = (rec.pending ??= [])
    // Bounded: a long boot under a fast clock must not stack a burst of stale hits.
    if (q.length < MAX_PENDING_NOTES) q.push({ note, vel, dur })
  }
}

/** Mono gate: sustain `note` while high, release on low. Held-note id lives in the record. */
export function setMonoGate(nodeId: string, high: boolean, note: number, vel: number): void {
  const rec = getVoice(nodeId)
  if (!rec?.instrument) return
  if (high && rec.heldId == null) {
    rec.heldId = rec.instrument.on(note, vel)
  } else if (!high && rec.heldId != null) {
    try { rec.instrument.off(rec.heldId) } catch { /* ignore */ }
    rec.heldId = null
  }
}

/** Poly gate: sustain the whole chord while high, release every voice on low. */
export function setPolyGate(nodeId: string, high: boolean, notes: number[], vel: number): void {
  const rec = getVoice(nodeId)
  if (!rec?.instrument) return
  if (high && rec.polyHeld.length === 0 && notes.length > 0) {
    rec.polyHeld = notes.map((n) => rec.instrument!.on(n, vel))
  } else if (!high && rec.polyHeld.length > 0) {
    for (const id of rec.polyHeld) { try { rec.instrument.off(id) } catch { /* ignore */ } }
    rec.polyHeld = []
  }
}

// ── Kernel sharing API (for other bellows node families) ─────────────────────
/** The shared kernel (booting it if needed). Rejects with a stale error if disposed mid-boot. */
export function acquireBellows(): Promise<Bellows> {
  return getBellows()
}

/** The booted kernel, or null while booting / stopped. */
export function currentBellows(): Bellows | null {
  return bellowsInstance
}

/** The current kernel generation — a handle made under an older generation is dead. */
export function kernelGeneration(): number {
  return kernelGen
}

/** True for the internal "disposed while booting" rejection (not a user-facing error). */
export function isStaleKernelError(e: unknown): boolean {
  return e instanceof StaleKernelError
}

/** The shared FDN reverb send bus on the current kernel (created on first request). */
export function sharedReverbBus(): BusHandle | null {
  return bellowsInstance ? ensureReverbBus(bellowsInstance) : null
}

/**
 * Register a module that holds channels on the shared kernel, with a live-work counter. While
 * any client reports > 0, GC never disposes the kernel out from under it.
 */
export function registerKernelClient(label: string, liveCount: () => number): void {
  kernelClients.set(label, liveCount)
}

export interface VoicePluginHandle {
  b: Bellows
  mod: VoicePluginModule
  gen: number
}

/**
 * Load the bellows-voice plugin (the articulatory singing/speaking engine) into the shared
 * kernel — once per kernel generation, and only when a voice node actually runs, so a flow
 * that never sings never fetches its ~160 KB worklet. `b.use()` adds the plugin's script to
 * the AudioWorklet via `addModule(blob:)` (same-origin, so COEP credentialless is fine — the
 * kernel itself loads the same way).
 */
export function loadVoicePlugin(): Promise<VoicePluginHandle> {
  if (voicePluginPromise && voicePluginGen === kernelGen) return voicePluginPromise
  const gen = kernelGen
  voicePluginGen = gen
  const p = (async () => {
    const [b, mod] = await Promise.all([getBellows(), import('bellows-voice')])
    await b.use(mod.voice)
    if (gen !== kernelGen) throw new StaleKernelError()
    return { b, mod, gen }
  })()
  voicePluginPromise = p
  p.catch(() => { if (voicePluginPromise === p) voicePluginPromise = null })
  return p
}

/** Dispose the kernel if no node of any family still uses it (called after a client's GC). */
export function releaseKernelIfIdle(): void {
  if (kernelInUse()) return
  if (bellowsInstance || bootPromise) disposeKernel()
}

function kernelInUse(): boolean {
  if (voices.size > 0) return true
  for (const live of kernelClients.values()) {
    try { if (live() > 0) return true } catch { /* ignore */ }
  }
  return false
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
/** Silence and free a single node's channel (tail rings out, then bellows drops the pool). */
function releaseVoice(nodeId: string): void {
  const rec = voices.get(nodeId)
  if (rec) retireInstrument(rec)
  voices.delete(nodeId)
}

/**
 * Dispose the shared kernel and reset the singletons so the next Play re-boots. Bumping the
 * generation turns any in-flight boot / plugin load into a self-disposing stale one.
 */
function disposeKernel(): void {
  kernelGen++
  if (bellowsInstance) {
    try { bellowsInstance.dispose() } catch { /* ignore */ }
  }
  bellowsInstance = null
  bellowsModule = null
  bootPromise = null
  reverbBus = null
  voicePluginPromise = null
  catalogDefaults.clear()
  try { masterKeepAlive?.dispose() } catch { /* ignore */ }
  masterKeepAlive = null
}

function gcBellows(validNodeIds: Set<string>): void {
  for (const nodeId of [...voices.keys()]) {
    if (!validNodeIds.has(nodeId)) releaseVoice(nodeId)
  }
  // Last bellows user gone → tear the kernel down (a fresh node re-boots lazily).
  releaseKernelIfIdle()
}

function disposeAllBellows(): void {
  // Engine stop: the kernel is going away, so free channels immediately (no deferred tails —
  // bellows' dispose() cancels pending removals anyway).
  for (const rec of voices.values()) retireInstrument(rec, 0)
  voices.clear()
  disposeKernel()
}

defineLifecycle({
  label: 'bellows',
  gc: gcBellows,
  disposeAll: disposeAllBellows,
})

// ── Test seams ───────────────────────────────────────────────────────────────
// The kernel never boots under happy-dom (no AudioWorklet), so these let unit tests
// drive applyConfig / gate logic against a fake instrument + kernel without booting.

/** Test-only reset (state maps persist across test files otherwise). */
export function __resetBellowsForTest(): void {
  voices.clear()
  kernelClients.clear()
  bellowsInstance = null
  bellowsModule = null
  bootPromise = null
  reverbBus = null
  voicePluginPromise = null
  catalogDefaults.clear()
}

/** Test-only: install a fake kernel (and optional module for preset/catalog lookups). */
export function __setKernelForTest(b: unknown, mod?: unknown): void {
  bellowsInstance = b as Bellows
  bellowsModule = (mod ?? null) as BellowsModule | null
  bootPromise = Promise.resolve(b as Bellows)
  reverbBus = null
  catalogDefaults.clear()
}

/** Test-only: run the engine-stop disposal. */
export function __disposeAllForTest(): void {
  disposeAllBellows()
}

/** Test-only: run per-node GC. */
export function __gcForTest(valid: Set<string>): void {
  gcBellows(valid)
}
