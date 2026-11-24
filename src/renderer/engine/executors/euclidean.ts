/**
 * Euclidean rhythm executor — Bjorklund's algorithm.
 *
 * Distributes `pulses` onsets as evenly as possible across `steps` positions
 * (the canonical Euclidean rhythm, e.g. E(3,8) = x..x..x.). The pattern is a
 * pure function of the `step` index input + the steps/pulses/rotation controls,
 * (the only per-node state is the last step, for the `trigger` onset output). Drive `step` with a Counter
 * or Metronome→Counter to advance the rhythm.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

/**
 * Last step index seen per node, for the `trigger` output (an onset pulse each time the step
 * ADVANCES onto a pulse). `gate` alone stays high across consecutive pulses (E(4,4), or any
 * adjacent onsets), so downstream edge detectors merged them into one hit.
 */
export const euclideanLastStep = defineNodeState<number>({ label: 'euclidean' })

const MAX_STEPS = 64

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(typeof v === 'number' ? v : fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

/**
 * Bjorklund's algorithm: returns a length-`steps` array of 0/1 with `pulses` ones,
 * maximally even, starting on a pulse (canonical Euclidean rhythm).
 */
export function bjorklund(steps: number, pulses: number): number[] {
  steps = Math.max(0, Math.floor(steps))
  pulses = Math.max(0, Math.min(steps, Math.floor(pulses)))
  if (steps === 0) return []
  if (pulses === 0) return new Array(steps).fill(0)
  if (pulses === steps) return new Array(steps).fill(1)

  let a: number[][] = Array.from({ length: pulses }, () => [1])
  let b: number[][] = Array.from({ length: steps - pulses }, () => [0])

  while (b.length > 1) {
    const n = Math.min(a.length, b.length)
    const merged: number[][] = []
    for (let i = 0; i < n; i++) merged.push([...a[i], ...b[i]])
    const remA = a.slice(n)
    const remB = b.slice(n)
    a = merged
    b = remA.length ? remA : remB
  }

  return [...a.flat(), ...b.flat()]
}

/**
 * Rotated-pattern memo keyed by `steps|pulses|rotation` (NOT nodeId — the pattern is a pure
 * function of those three, shared across every euclidean node). The executor runs every frame
 * but the pattern only changes when a control changes, so this avoids an O(steps) Bjorklund +
 * two array allocations per frame. Bounded by the distinct control combos in a flow (tiny);
 * frozen so a downstream consumer can't mutate the shared array. Mirrors chord's memoization.
 */
const patternCache = new Map<string, readonly number[]>()

function rotatedPattern(steps: number, pulses: number, rotation: number): readonly number[] {
  const key = `${steps}|${pulses}|${rotation}`
  let pattern = patternCache.get(key)
  if (!pattern) {
    const base = bjorklund(steps, pulses)
    // Positive rotation shifts the pattern later in the sequence.
    pattern = base.map((_, i) => base[(((i - rotation) % steps) + steps) % steps])
    if (patternCache.size > 512) patternCache.clear() // unbounded-growth backstop
    patternCache.set(key, pattern)
  }
  return pattern
}

export const euclideanExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const steps = clampInt(ctx.controls.get('steps'), 1, MAX_STEPS, 8)
  const pulses = clampInt(ctx.controls.get('pulses'), 0, steps, 3)
  const rotation = clampInt(ctx.controls.get('rotation'), -MAX_STEPS, MAX_STEPS, 0)
  // ctx.num: a NaN / non-numeric step used to index pattern[NaN] → silently "no pulse".
  const stepIn = Math.floor(ctx.num('step', 0))

  const pattern = rotatedPattern(steps, pulses, rotation)

  const idx = (((stepIn % steps) + steps) % steps)
  const active = pattern[idx] === 1

  const outputs = new Map<string, unknown>()
  outputs.set('gate', active)
  outputs.set('value', active ? 1 : 0)
  // Output a shallow COPY, never the cached array itself — a downstream code/function node that
  // mutates its input must not corrupt the shared memo (and a frozen array would throw). The
  // copy of a ≤64-element array is far cheaper than the Bjorklund + rotation the memo avoids.
  outputs.set('pattern', [...pattern])
  outputs.set('pulses', pulses)
  const prev = euclideanLastStep.get(ctx.nodeId)
  euclideanLastStep.set(ctx.nodeId, stepIn)
  outputs.set('trigger', active && prev !== stepIn ? 1 : 0)
  return outputs
}
