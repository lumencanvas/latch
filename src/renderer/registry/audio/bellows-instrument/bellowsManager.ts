/**
 * Bellows kernel manager (Thread D — D1).
 *
 * bellowsjs boots one AudioWorklet kernel that hosts every voice; there is NO free
 * Web-Audio graph out of it — the only boundary node is `b.analyser`. So LATCH shares
 * ONE kernel per session (the plan's "one Bellows.boot() per flow"): each
 * `bellows-instrument` node is a `b.voice()`, and the shared kernel output is routed
 * ONCE into LATCH's master gain (so master volume / meter / recording capture it).
 * Individual nodes therefore have no wireable audio-output port — they play straight
 * through the shared kernel into master. (Per-node wireable outputs would need a kernel
 * per node; deferred.)
 *
 * bellowsjs is loaded via a dynamic `import()` so its DSP core + worklet land in a
 * lazy chunk — zero cost until the first bellows-instrument node runs.
 *
 * Lifecycle mirrors the audio category: state is GC'd when a node is removed and the
 * whole kernel is disposed on engine stop (the repo's recurring leak class).
 */

import { audioManager, Tone } from '@/services/audio/AudioManager'
import { defineLifecycle } from '@/engine/nodeState'
import type { Bellows, Instrument } from 'bellowsjs'

// ── Shared kernel singleton ──────────────────────────────────────────────────
let bellowsInstance: Bellows | null = null
let bootPromise: Promise<Bellows> | null = null

/** Per-node voice record. `instrument` is null until the async boot resolves. */
interface NodeVoice {
  engine: string
  instrument: Instrument | null
  heldId: number | null
  gateHigh: boolean
  prevGain: number
  prevPan: number
  error: string | null
  /** One-shot notes triggered while the kernel was still booting; replayed on boot. */
  pending?: { note: number; vel: number; dur: string }[]
}

const voices = new Map<string, NodeVoice>()

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
 * LATCH's master gain. Idempotent: concurrent callers share one boot promise.
 */
async function getBellows(): Promise<Bellows> {
  if (bellowsInstance) return bellowsInstance
  if (bootPromise) return bootPromise

  bootPromise = (async () => {
    // Reuse LATCH's gesture-unlocked context (the engine only runs post-Play).
    await audioManager.initialize()
    const nativeCtx = nativeContextOf(Tone.getContext().rawContext as unknown)
    if (!nativeCtx) throw new Error('bellows: could not recover native AudioContext from Tone wrapper')

    // Lazy chunk — bellows' DSP core + worklet stay out of the main bundle.
    const { Bellows } = await import('bellowsjs')
    const b = await Bellows.boot({ context: nativeCtx })

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

    bellowsInstance = b
    return b
  })()

  return bootPromise
}

/**
 * Ensure a voice record exists for `nodeId` (idempotent per node). Creates the record
 * synchronously with `instrument: null`, then fills it in once the shared kernel boots.
 */
export function acquireVoice(nodeId: string, engine: string): void {
  if (voices.has(nodeId)) return
  const rec: NodeVoice = {
    engine,
    instrument: null,
    heldId: null,
    gateHigh: false,
    prevGain: NaN,
    prevPan: NaN,
    error: null,
  }
  voices.set(nodeId, rec)

  getBellows()
    .then((b) => {
      const r = voices.get(nodeId)
      if (!r || r.instrument) return // node removed, or already voiced
      r.instrument = b.voice(r.engine)
      // Replay one-shots queued while the kernel was booting so the first hit isn't lost.
      if (r.pending) {
        for (const p of r.pending) {
          try { r.instrument.note(p.note, { dur: p.dur, vel: p.vel }) } catch { /* ignore */ }
        }
        r.pending = undefined
      }
    })
    .catch((e) => {
      const r = voices.get(nodeId)
      if (r) r.error = String((e as { message?: string })?.message ?? e)
    })
}

/** The live voice record for a node, or null while still booting / on error. */
export function getVoice(nodeId: string): NodeVoice | null {
  const rec = voices.get(nodeId)
  return rec?.instrument ? rec : null
}

/**
 * Play a one-shot note now, or QUEUE it if the shared kernel is still booting (it's
 * replayed on the first frame after boot) — so a trigger firing during the async boot
 * window isn't dropped. No-op until the node has a voice record (call acquireVoice first).
 */
export function queueNote(nodeId: string, note: number, vel: number, dur = '8n'): void {
  const rec = voices.get(nodeId)
  if (!rec) return
  if (rec.instrument) {
    rec.instrument.note(note, { dur, vel })
  } else {
    (rec.pending ??= []).push({ note, vel, dur })
  }
}

/**
 * Switch a node's engine. No-op unless the engine actually changed; when the kernel is
 * already up the swap is synchronous (silence the old channel, allocate a new voice).
 */
export function setVoiceEngine(nodeId: string, engine: string): void {
  const rec = voices.get(nodeId)
  if (!rec || rec.engine === engine) return
  rec.engine = engine
  if (rec.instrument && bellowsInstance) {
    try { rec.instrument.allOff() } catch { /* ignore */ }
    rec.instrument = bellowsInstance.voice(engine)
    rec.heldId = null
    rec.gateHigh = false
    rec.prevGain = NaN
    rec.prevPan = NaN
  }
}

/** Silence and drop a single node's voice. */
function releaseVoice(nodeId: string): void {
  const rec = voices.get(nodeId)
  if (rec?.instrument) {
    try { rec.instrument.allOff() } catch { /* ignore */ }
  }
  voices.delete(nodeId)
}

/** Dispose the shared kernel and reset the singleton so the next Play re-boots. */
function disposeKernel(): void {
  if (bellowsInstance) {
    try { bellowsInstance.dispose() } catch { /* ignore */ }
  }
  bellowsInstance = null
  bootPromise = null
}

// ── Engine lifecycle integration ─────────────────────────────────────────────
function gcBellows(validNodeIds: Set<string>): void {
  for (const nodeId of [...voices.keys()]) {
    if (!validNodeIds.has(nodeId)) releaseVoice(nodeId)
  }
  // Last bellows node gone → tear the kernel down (a fresh node re-boots lazily).
  if (voices.size === 0) disposeKernel()
}

function disposeAllBellows(): void {
  for (const rec of voices.values()) {
    if (rec.instrument) {
      try { rec.instrument.allOff() } catch { /* ignore */ }
    }
  }
  voices.clear()
  disposeKernel()
}

defineLifecycle({
  label: 'bellows',
  gc: gcBellows,
  disposeAll: disposeAllBellows,
})

// Test-only reset hook (kernel never boots under happy-dom, but state maps persist
// across test files otherwise).
export function __resetBellowsForTest(): void {
  voices.clear()
  bellowsInstance = null
  bootPromise = null
}
