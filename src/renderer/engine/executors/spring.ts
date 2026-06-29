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

interface SpringState {
  pos: number
  vel: number
}

export const springState = defineNodeState<SpringState>({ label: 'spring' })

// Cap dt so a long frame (tab backgrounded, GC pause) can't blow up the integrator.
const MAX_DT = 1 / 30
const REST_EPS = 0.001

export const springExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('target') as number) ?? 0
  const reset = ctx.inputs.get('reset')
  const tension = Math.max(0, (ctx.controls.get('tension') as number) ?? 120)
  const friction = Math.max(0, (ctx.controls.get('friction') as number) ?? 14)
  const mass = Math.max(0.01, (ctx.controls.get('mass') as number) ?? 1)
  const dt = Math.min(Math.max(ctx.deltaTime, 0), MAX_DT)

  let state = springState.get(ctx.nodeId)
  // Initialise at the target so there's no startup lurch on the first frame.
  if (!state) {
    state = { pos: target, vel: 0 }
    springState.set(ctx.nodeId, state)
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
