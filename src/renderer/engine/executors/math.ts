/**
 * Math node executors — arithmetic + advanced (add … modulo, lerp … wrap).
 * smooth keeps per-node state via defineNodeState. Extracted from index.ts
 * (Phase 1 de-monolith).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

// add / subtract / multiply / divide migrated to co-located node.ts files (Phase 6).

export const mapRangeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const inMin = (ctx.controls.get('inMin') as number) ?? 0
  const inMax = (ctx.controls.get('inMax') as number) ?? 1
  const outMin = (ctx.controls.get('outMin') as number) ?? 0
  const outMax = (ctx.controls.get('outMax') as number) ?? 100

  // Normalize to 0-1 then scale to output range
  const normalized = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0
  const result = normalized * (outMax - outMin) + outMin

  return new Map([['result', result]])
}

export const clampExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  return new Map([['result', Math.min(max, Math.max(min, value))]])
}

export const absExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  return new Map([['result', Math.abs(value)]])
}

// Per-node smoothing state (previous output). Outputs aren't fed back as inputs,
// so the previous value must live here, not in controls/outputs. defineNodeState
// auto-registers gc/dispose with the engine's generic lifecycle loop.
export const smoothState = defineNodeState<number>({ label: 'smooth' })

export const smoothExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('value') as number) ?? 0
  const rawFactor = (ctx.controls.get('factor') as number) ?? 0.1
  // Guard against NaN and invalid values
  const factor = Number.isFinite(rawFactor) ? rawFactor : 0.1

  // First frame (no stored state) initializes to the target, then eases toward it.
  const prev = smoothState.get(ctx.nodeId) ?? target
  const smoothed = prev + (target - prev) * Math.min(1, factor * ctx.deltaTime * 60)
  smoothState.set(ctx.nodeId, smoothed)

  return new Map<string, unknown>([['result', smoothed]])
}

export const randomExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  const seed = ctx.inputs.get('seed') !== undefined

  // If seed input is connected, use it for deterministic random
  if (seed) {
    const seedValue = ctx.inputs.get('seed') as number
    const x = Math.sin(seedValue * 12.9898) * 43758.5453
    const random = x - Math.floor(x)
    return new Map([['result', random * (max - min) + min]])
  }

  return new Map([['result', Math.random() * (max - min) + min]])
}

export const trigExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const fn = (ctx.controls.get('function') as string) ?? 'sin'
  const useDegrees = (ctx.controls.get('degrees') as boolean) ?? false

  // Convert to radians if needed
  const input = useDegrees ? (value * Math.PI) / 180 : value

  let result: number
  switch (fn) {
    case 'sin':
      result = Math.sin(input)
      break
    case 'cos':
      result = Math.cos(input)
      break
    case 'tan':
      result = Math.tan(input)
      break
    case 'asin':
      result = Math.asin(value) // asin/acos/atan take normalized values
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'acos':
      result = Math.acos(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'atan':
      result = Math.atan(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'sinh':
      result = Math.sinh(input)
      break
    case 'cosh':
      result = Math.cosh(input)
      break
    case 'tanh':
      result = Math.tanh(input)
      break
    default:
      result = Math.sin(input)
  }

  return new Map([['result', result]])
}

export const powerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const base = (ctx.inputs.get('base') as number) ?? 0
  const exponentInput = ctx.inputs.get('exponent') as number | undefined
  const exponentControl = (ctx.controls.get('exponent') as number) ?? 2
  const exponent = exponentInput ?? exponentControl
  const operation = (ctx.controls.get('operation') as string) ?? 'Power'

  let result: number
  switch (operation) {
    case 'Power':
      result = Math.pow(base, exponent)
      break
    case 'Sqrt':
      result = Math.sqrt(base)
      break
    case 'Cbrt':
      result = Math.cbrt(base)
      break
    case 'Log':
      result = Math.log(base) / Math.log(exponent) // Log base exponent
      break
    case 'Log10':
      result = Math.log10(base)
      break
    case 'Ln':
      result = Math.log(base)
      break
    case 'Exp':
      result = Math.exp(base)
      break
    default:
      result = Math.pow(base, exponent)
  }

  // Guard NaN *and* ±Infinity (e.g. log(0) = -Infinity, pow(0, -1) = Infinity) —
  // isNaN alone let infinities propagate downstream. (AUDIT §E.)
  return new Map([['result', Number.isFinite(result) ? result : 0]])
}

export const vectorMathExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const ax = (ctx.inputs.get('ax') as number) ?? 0
  const ay = (ctx.inputs.get('ay') as number) ?? 0
  const az = (ctx.inputs.get('az') as number) ?? 0
  const bx = (ctx.inputs.get('bx') as number) ?? 0
  const by = (ctx.inputs.get('by') as number) ?? 0
  const bz = (ctx.inputs.get('bz') as number) ?? 0
  const scalar = (ctx.controls.get('scalar') as number) ?? 1
  const operation = (ctx.controls.get('operation') as string) ?? 'Add'

  let x: number, y: number, z: number

  switch (operation) {
    case 'Add':
      x = ax + bx
      y = ay + by
      z = az + bz
      break
    case 'Subtract':
      x = ax - bx
      y = ay - by
      z = az - bz
      break
    case 'Cross':
      x = ay * bz - az * by
      y = az * bx - ax * bz
      z = ax * by - ay * bx
      break
    case 'Normalize': {
      const mag = Math.sqrt(ax * ax + ay * ay + az * az)
      if (mag > 0) {
        x = ax / mag
        y = ay / mag
        z = az / mag
      } else {
        x = y = z = 0
      }
      break
    }
    case 'Scale':
      x = ax * scalar
      y = ay * scalar
      z = az * scalar
      break
    case 'Lerp':
      x = ax + (bx - ax) * scalar
      y = ay + (by - ay) * scalar
      z = az + (bz - az) * scalar
      break
    case 'Dot': {
      const dot = ax * bx + ay * by + az * bz
      x = dot
      y = dot
      z = dot
      break
    }
    default:
      x = ax + bx
      y = ay + by
      z = az + bz
  }

  const magnitude = Math.sqrt(x * x + y * y + z * z)

  return new Map([
    ['x', x],
    ['y', y],
    ['z', z],
    ['magnitude', magnitude],
  ])
}

export const moduloExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const divisorInput = ctx.inputs.get('divisor') as number | undefined
  const divisorControl = (ctx.controls.get('divisor') as number) ?? 1
  const divisor = divisorInput ?? divisorControl
  const mode = (ctx.controls.get('mode') as string) ?? 'Standard'

  if (divisor === 0) {
    return new Map([['result', 0]])
  }

  let result: number
  switch (mode) {
    case 'Standard':
      result = value % divisor
      break
    case 'Positive':
      // Always returns positive result
      result = ((value % divisor) + divisor) % divisor
      break
    case 'Floor':
      // Floor division remainder (Python-style)
      result = value - divisor * Math.floor(value / divisor)
      break
    default:
      result = value % divisor
  }

  return new Map([['result', result]])
}

// ============================================================================
// Advanced Math
// ============================================================================

export const lerpExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 1
  const t = (ctx.inputs.get('t') as number) ?? 0.5

  const result = a + (b - a) * t

  return new Map([['result', result]])
}

export const stepExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const edge = (ctx.controls.get('edge') as number) ?? 0.5

  const result = value < edge ? 0 : 1

  return new Map([['result', result]])
}

export const smoothstepExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const edge0 = (ctx.controls.get('edge0') as number) ?? 0
  const edge1 = (ctx.controls.get('edge1') as number) ?? 1

  // Clamp to 0-1 range
  let t = (value - edge0) / (edge1 - edge0)
  t = Math.max(0, Math.min(1, t))

  // Hermite interpolation
  const result = t * t * (3 - 2 * t)

  return new Map([['result', result]])
}

export const remapExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const inMin = (ctx.controls.get('inMin') as number) ?? 0
  const inMax = (ctx.controls.get('inMax') as number) ?? 1
  const outMin = (ctx.controls.get('outMin') as number) ?? 0
  const outMax = (ctx.controls.get('outMax') as number) ?? 100
  const clamp = (ctx.controls.get('clamp') as boolean) ?? true
  const easing = (ctx.controls.get('easing') as string) ?? 'linear'

  // Normalize to 0-1
  let t = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0

  // Clamp if enabled
  if (clamp) {
    t = Math.max(0, Math.min(1, t))
  }

  // Apply easing
  switch (easing) {
    case 'ease-in':
      t = t * t
      break
    case 'ease-out':
      t = 1 - (1 - t) * (1 - t)
      break
    case 'ease-in-out':
      t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      break
    // linear: no change
  }

  const result = t * (outMax - outMin) + outMin

  return new Map([['result', result]])
}

export const quantizeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const step = (ctx.controls.get('step') as number) ?? 1

  if (step === 0) {
    return new Map([['result', value]])
  }

  const result = Math.round(value / step) * step

  return new Map([['result', result]])
}

export const wrapExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1

  const range = max - min

  if (range === 0) {
    return new Map([['result', min]])
  }

  // Proper wrap that handles negatives correctly
  const result = ((value - min) % range + range) % range + min

  return new Map([['result', result]])
}
