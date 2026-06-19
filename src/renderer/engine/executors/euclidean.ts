/**
 * Euclidean rhythm executor — Bjorklund's algorithm.
 *
 * Distributes `pulses` onsets as evenly as possible across `steps` positions
 * (the canonical Euclidean rhythm, e.g. E(3,8) = x..x..x.). Stateless: it's a
 * pure function of the `step` index input + the steps/pulses/rotation controls,
 * so there is no per-node state to garbage-collect. Drive `step` with a Counter
 * or Metronome→Counter to advance the rhythm.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

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

export const euclideanExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const steps = clampInt(ctx.controls.get('steps'), 1, MAX_STEPS, 8)
  const pulses = clampInt(ctx.controls.get('pulses'), 0, steps, 3)
  const rotation = clampInt(ctx.controls.get('rotation'), -MAX_STEPS, MAX_STEPS, 0)
  const stepIn = Math.floor((ctx.inputs.get('step') as number) ?? 0)

  const base = bjorklund(steps, pulses)
  // Apply rotation: a positive rotation shifts the pattern later in the sequence.
  const pattern = base.map((_, i) => base[(((i - rotation) % steps) + steps) % steps])

  const idx = (((stepIn % steps) + steps) % steps)
  const active = pattern[idx] === 1

  const outputs = new Map<string, unknown>()
  outputs.set('gate', active)
  outputs.set('value', active ? 1 : 0)
  outputs.set('pattern', pattern)
  outputs.set('pulses', pulses)
  return outputs
}
