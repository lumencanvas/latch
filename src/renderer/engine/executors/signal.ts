/**
 * Signal-processing executors — stateful, deltaTime-driven scalar utilities:
 * slew limiter, derivative, integral, and tween-to-target.
 *
 * All keep per-node state in one module Map and register a gc/dispose path
 * wired into ExecutionEngine (gcSignalState / disposeAllSignalState below),
 * mirroring the spring executor.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

interface SignalState {
  current: number // slew / tween running value
  last: number // derivative previous input
  hasLast: boolean
  sum: number // integral accumulator
}

const signalState = new Map<string, SignalState>()

// Cap dt so a long frame (tab backgrounded, GC pause) can't blow up a rate.
const MAX_DT = 1 / 15

function getState(nodeId: string, init: number): SignalState {
  let s = signalState.get(nodeId)
  if (!s) {
    s = { current: init, last: init, hasLast: false, sum: 0 }
    signalState.set(nodeId, s)
  }
  return s
}

function isReset(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === 'number' && v > 0)
}

function clampDt(dt: number): number {
  return Math.min(Math.max(dt, 0), MAX_DT)
}

/** Slew limiter: cap how fast the output can rise/fall toward the input (units/sec). */
export const slewLimiterExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('value') as number) ?? (ctx.inputs.get('target') as number) ?? 0
  const rise = Math.max(0, (ctx.controls.get('rise') as number) ?? 1)
  const fall = Math.max(0, (ctx.controls.get('fall') as number) ?? 1)
  const dt = clampDt(ctx.deltaTime)
  const state = getState(ctx.nodeId, target)

  if (isReset(ctx.inputs.get('reset'))) {
    state.current = target
  } else {
    const delta = target - state.current
    if (delta > 0) state.current += Math.min(delta, rise * dt)
    else if (delta < 0) state.current += Math.max(delta, -fall * dt)
  }

  return new Map<string, unknown>([['value', state.current]])
}

/** Derivative: rate of change of the input per second. */
export const derivativeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const dt = clampDt(ctx.deltaTime)
  const state = getState(ctx.nodeId, value)

  let rate = 0
  if (state.hasLast && dt > 0) rate = (value - state.last) / dt
  state.last = value
  state.hasLast = true

  return new Map<string, unknown>([['derivative', rate]])
}

/** Integral: time-accumulated sum of the input (optionally clamped). */
export const integralExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const dt = clampDt(ctx.deltaTime)
  const min = ctx.controls.get('min') as number
  const max = ctx.controls.get('max') as number
  const state = getState(ctx.nodeId, 0)

  if (isReset(ctx.inputs.get('reset'))) {
    state.sum = 0
  } else {
    state.sum += value * dt
    if (typeof min === 'number' && typeof max === 'number' && max > min) {
      state.sum = Math.min(max, Math.max(min, state.sum))
    }
  }

  return new Map<string, unknown>([['integral', state.sum]])
}

/** Tween to target: frame-rate-independent exponential approach to a moving target. */
const TWEEN_EPS = 0.0001
export const tweenToTargetExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('target') as number) ?? (ctx.controls.get('target') as number) ?? 0
  const speed = Math.max(0, (ctx.controls.get('speed') as number) ?? 5)
  const dt = clampDt(ctx.deltaTime)
  const state = getState(ctx.nodeId, target)

  if (isReset(ctx.inputs.get('reset'))) {
    state.current = target
  } else if (speed > 0) {
    // 1 - e^(-speed·dt) is the fraction of the remaining gap to close this frame,
    // which stays consistent regardless of frame rate.
    state.current += (target - state.current) * (1 - Math.exp(-speed * dt))
  }

  const arrived = Math.abs(target - state.current) < TWEEN_EPS
  if (arrived) state.current = target

  return new Map<string, unknown>([
    ['value', state.current],
    ['arrived', arrived],
  ])
}

/** Tap tempo: derive BPM from the spacing of trigger taps. */
interface TapState {
  taps: number[]
  lastHigh: boolean
  bpm: number
}
const tapState = new Map<string, TapState>()
const TAP_TIMEOUT = 2 // s — a gap longer than this restarts the tempo
const MAX_TAPS = 6

export const tapTempoExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const tap = ctx.inputs.get('tap')
  const now = ctx.totalTime

  let st = tapState.get(ctx.nodeId)
  if (!st) {
    st = { taps: [], lastHigh: false, bpm: 0 }
    tapState.set(ctx.nodeId, st)
  }

  if (isReset(ctx.inputs.get('reset'))) {
    st.taps = []
    st.bpm = 0
  }

  const high = tap === true || tap === 1 || (typeof tap === 'number' && tap > 0)
  const rising = high && !st.lastHigh
  st.lastHigh = high

  if (rising) {
    const last = st.taps[st.taps.length - 1]
    if (last !== undefined && now - last > TAP_TIMEOUT) st.taps = [] // stale → restart
    st.taps.push(now)
    if (st.taps.length > MAX_TAPS) st.taps.shift()
    if (st.taps.length >= 2) {
      let sum = 0
      for (let i = 1; i < st.taps.length; i++) sum += st.taps[i] - st.taps[i - 1]
      const avg = sum / (st.taps.length - 1)
      st.bpm = avg > 0 ? 60 / avg : 0
    }
  }

  const period = st.bpm > 0 ? 60 / st.bpm : 0
  return new Map<string, unknown>([
    ['bpm', st.bpm],
    ['period', period],
    ['taps', st.taps.length],
  ])
}

/** Drop signal state for nodes that no longer exist (per-node GC). */
export function gcSignalState(validNodeIds: Set<string>): void {
  for (const id of signalState.keys()) {
    if (!validNodeIds.has(id)) signalState.delete(id)
  }
  for (const id of tapState.keys()) {
    if (!validNodeIds.has(id)) tapState.delete(id)
  }
}

/** Clear all signal state (engine stop / teardown). */
export function disposeAllSignalState(): void {
  signalState.clear()
  tapState.clear()
}
