/**
 * Spring executor — damped-harmonic-oscillator physics toward a target.
 *
 * Gives physical motion (mass / tension / friction) that fixed easing curves
 * can't: natural overshoot and settle. Stateful (position + velocity per node);
 * `defineNodeState` auto-registers the gc/dispose path with the engine, so there
 * is no bespoke gc/disposeAll function to wire in by hand.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'
import { finiteOr } from './signal'

interface SpringState {
  pos: number
  vel: number
}

export const springState = defineNodeState<SpringState>({ label: 'spring' })

// Cap dt so a long frame (tab backgrounded, GC pause) can't blow up the integrator.
const MAX_DT = 1 / 30
const REST_EPS = 0.001

export const springExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  let state = springState.get(ctx.nodeId)
  // A NaN / non-numeric target holds the current position instead of poisoning the state.
  const target = finiteOr(ctx.inputs.get('target'), state?.pos ?? 0)
  const reset = ctx.inputs.get('reset')
  const tension = Math.max(0, finiteOr(ctx.controls.get('tension'), 120))
  const friction = Math.max(0, finiteOr(ctx.controls.get('friction'), 14))
  const mass = Math.max(0.01, finiteOr(ctx.controls.get('mass'), 1))
  const dt = Math.min(Math.max(ctx.deltaTime, 0), MAX_DT)

  // Initialise at the target so there's no startup lurch on the first frame.
  if (!state) {
    state = { pos: target, vel: 0 }
    springState.set(ctx.nodeId, state)
  }
  // Self-heal if the integrator ever went non-finite (e.g. extreme tension/mass).
  if (!Number.isFinite(state.pos) || !Number.isFinite(state.vel)) {
    state.pos = target
    state.vel = 0
  }

  const resetting = reset === true || reset === 1 || (typeof reset === 'number' && reset > 0)
  if (resetting) {
    state.pos = target
    state.vel = 0
  } else {
    const accel = (tension * (target - state.pos) - friction * state.vel) / mass
    state.vel += accel * dt
    state.pos += state.vel * dt
  }

  const atRest = Math.abs(target - state.pos) < REST_EPS && Math.abs(state.vel) < REST_EPS
  if (atRest) {
    // Snap to avoid asymptotic dust accumulating forever.
    state.pos = target
    state.vel = 0
  }

  return new Map<string, unknown>([
    ['value', state.pos],
    ['velocity', state.vel],
    ['atRest', atRest],
  ])
}
