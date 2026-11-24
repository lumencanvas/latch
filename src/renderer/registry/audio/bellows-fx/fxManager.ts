/**
 * bellows-fx manager: each bellows effect node is ONE direct-input channel on LATCH's shared
 * bellows kernel (`b.inputChannel(k)`) carrying ONE insert effect. The node's upstream audio (any
 * LATCH Tone node: an oscillator, a mic, a bellows instrument's Audio out…) is connected into the
 * kernel's direct input k; the channel plays it through the effect and out of the node's own
 * direct output while its Audio port is wired, or into master while it isn't (the same rule as
 * the bellows instruments).
 *
 * Per-frame diffing: the effect id rebuilds the chain (a new effect has nothing to keep); a param
 * change is an `fxParam` on the live effect, so a delay or reverb tail is never flushed by a knob.
 *
 * Lifecycle: per-node channels + ports are freed on node delete (gc) and engine stop
 * (disposeAll); a kernel generation stamp turns a channel that outlived its kernel into a
 * rebuild. The shared kernel is torn down only when no bellows family has live work.
 */

import type { Bellows, Instrument } from 'bellowsjs'
import { defineLifecycle } from '@/engine/nodeState'
import {
  acquireBellows,
  currentBellows,
  kernelGeneration,
  isStaleKernelError,
  registerKernelClient,
  releaseKernelIfIdle,
  acquireInputPort,
  feedInputPort,
  releaseDirectPorts,
  routeChannel,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import type { FxConfig } from './fxParams'

interface FxRec {
  channel: Instrument | null
  gen: number
  effect: string
  params: Record<string, number>
  level: number
  booting: boolean
  error: string | null
  /** gen whose channel build failed (no per-frame retry until the kernel changes). */
  failedGen?: number
}

const recs = new Map<string, FxRec>()

registerKernelClient('bellows-fx', () => recs.size)

function errText(e: unknown): string {
  return String((e as { message?: string })?.message ?? e)
}

function disposeChannel(rec: FxRec, releaseSeconds: number): void {
  if (rec.channel) {
    try { rec.channel.dispose({ releaseSeconds }) } catch { /* ignore */ }
  }
  rec.channel = null
}

/** Build the node's input channel + effect on the current kernel. */
function build(nodeId: string, rec: FxRec, b: Bellows, cfg: FxConfig): void {
  const gen = kernelGeneration()
  if (rec.failedGen === gen) return
  const port = acquireInputPort(nodeId, b)
  if (!port) {
    rec.error = 'No free bellows input (16 effect nodes at most)'
    rec.failedGen = gen
    return
  }
  try {
    const ch = b.inputChannel(port.k)
    ch.gain(cfg.level)
    ch.fx([cfg.effect, cfg.params])
    rec.channel = ch
    rec.gen = gen
    rec.effect = cfg.effect
    rec.params = { ...cfg.params }
    rec.level = cfg.level
    rec.error = null
    rec.failedGen = undefined
  } catch (e) {
    rec.error = errText(e)
    rec.failedGen = gen
    console.warn('[bellows-fx] could not build the effect channel:', rec.error)
  }
}

function apply(rec: FxRec, cfg: FxConfig): void {
  const ch = rec.channel
  if (!ch) return
  if (rec.effect !== cfg.effect) {
    try { ch.fx([cfg.effect, cfg.params]) } catch (e) { rec.error = errText(e) }
    rec.effect = cfg.effect
    rec.params = { ...cfg.params }
  } else {
    for (const [name, value] of Object.entries(cfg.params)) {
      if (rec.params[name] === value) continue
      try { ch.fxParam(0, name, value) } catch { /* unknown name: ignored by the kernel */ }
      rec.params[name] = value
    }
  }
  if (rec.level !== cfg.level) {
    try { ch.gain(cfg.level) } catch { /* ignore */ }
    rec.level = cfg.level
  }
}

/**
 * Idempotently ensure the node's effect channel, push its config, feed it `source` (a Tone node
 * or null) and route it. Returns the Tone node for the Audio output (null while unwired, booting,
 * or when no direct output is free: it then plays into master).
 */
export function runFx(nodeId: string, cfg: FxConfig, source: unknown, wired: boolean): unknown {
  let rec = recs.get(nodeId)
  if (!rec) {
    rec = { channel: null, gen: -1, effect: cfg.effect, params: {}, level: cfg.level, booting: false, error: null }
    recs.set(nodeId, rec)
  }
  const b = currentBellows()
  if (!b) {
    if (!rec.booting && !rec.error) {
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
    return null
  }
  if (rec.channel && rec.gen !== kernelGeneration()) {
    rec.channel = null // its kernel is gone; the ports were released with it
  }
  if (!rec.channel) build(nodeId, rec, b, cfg)
  else apply(rec, cfg)
  if (!rec.channel) return null
  const port = acquireInputPort(nodeId, b)
  if (port) feedInputPort(port, source)
  return routeChannel(nodeId, rec.channel, wired)
}

export function getFxError(nodeId: string): string | null {
  return recs.get(nodeId)?.error ?? null
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
function gcFx(valid: Set<string>): void {
  let removed = false
  for (const [id, rec] of [...recs]) {
    if (valid.has(id)) continue
    disposeChannel(rec, 0)
    releaseDirectPorts(id)
    recs.delete(id)
    removed = true
  }
  if (removed) releaseKernelIfIdle()
}

function disposeAllFx(): void {
  for (const [id, rec] of recs) {
    disposeChannel(rec, 0)
    releaseDirectPorts(id)
  }
  recs.clear()
}

defineLifecycle({ label: 'bellows-fx', gc: gcFx, disposeAll: disposeAllFx })

// ── Test seams ───────────────────────────────────────────────────────────────
export function __resetFxForTest(): void {
  recs.clear()
  registerKernelClient('bellows-fx', () => recs.size)
}
export function __gcFxForTest(valid: Set<string>): void {
  gcFx(valid)
}
export function __disposeAllFxForTest(): void {
  disposeAllFx()
}
