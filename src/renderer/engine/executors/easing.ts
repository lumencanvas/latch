/**
 * Easing executor — shapes a 0..1 value through a selectable easing curve.
 *
 * Stateless: a pure function of the input + the curve control, so there is no
 * per-node state to garbage-collect. Standard Penner / easings.net curves.
 *
 * Note: back/elastic curves intentionally overshoot the [0,1] range — that's the
 * effect — so the OUTPUT is never clamped. The INPUT is clamped to [0,1] by
 * default (toggle off to extrapolate the curve).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

const c1 = 1.70158
const c3 = c1 + 1
const c2 = c1 * 1.525
const c4 = (2 * Math.PI) / 3

function outBounce(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75 }
  if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375 }
  t -= 2.625 / d1
  return n1 * t * t + 0.984375
}

// Keep the keys in sync with the `curve` control options in registry/math/easing.ts.
export const EASINGS: Record<string, (t: number) => number> = {
  'linear': (t) => t,
  'in-quad': (t) => t * t,
  'out-quad': (t) => 1 - (1 - t) * (1 - t),
  'in-out-quad': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  'in-cubic': (t) => t * t * t,
  'out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'in-out-cubic': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  'in-sine': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'out-sine': (t) => Math.sin((t * Math.PI) / 2),
  'in-out-sine': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'in-expo': (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  'out-expo': (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  'in-out-expo': (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  'in-back': (t) => c3 * t * t * t - c1 * t * t,
  'out-back': (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  'in-out-back': (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  'in-elastic': (t) => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4)),
  'out-elastic': (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  'in-bounce': (t) => 1 - outBounce(1 - t),
  'out-bounce': (t) => outBounce(t),
}

export const easingExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const curve = (ctx.controls.get('curve') as string) ?? 'in-out-cubic'
  const clampInput = (ctx.controls.get('clampInput') as boolean) ?? true

  let t = (ctx.inputs.get('t') as number) ?? 0
  if (clampInput) t = Math.max(0, Math.min(1, t))

  const fn = EASINGS[curve] ?? EASINGS['linear']
  return new Map<string, unknown>([['value', fn(t)]])
}
