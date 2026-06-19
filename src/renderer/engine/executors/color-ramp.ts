/**
 * Color Ramp executor — maps a 0..1 value to an RGBA colour via a gradient palette.
 *
 * Stateless: palettes are module-level constants and the output depends only on
 * the inputs/controls, so there is no per-node state to garbage-collect.
 *
 * The colour output is an [r, g, b, a] array (0..1), matching the Color node so it
 * wires straight into shaders, blend, and colour-correction.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

type RGB = [number, number, number]

// Named palettes as evenly-spaced RGB stops (0..1). Keep the keys in sync with the
// `preset` control options in registry/visual/color-ramp.ts.
export const PALETTES: Record<string, RGB[]> = {
  viridis: [[0.27, 0.0, 0.33], [0.23, 0.32, 0.55], [0.13, 0.57, 0.55], [0.37, 0.79, 0.38], [0.99, 0.91, 0.15]],
  rainbow: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 0, 0]],
  heat: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  fire: [[0, 0, 0], [0.5, 0, 0], [1, 0.3, 0], [1, 0.8, 0.1], [1, 1, 0.85]],
  ice: [[0, 0, 0.1], [0, 0.3, 0.8], [0, 0.8, 1], [0.85, 1, 1]],
  cool: [[0, 1, 1], [1, 0, 1]],
  grayscale: [[0, 0, 0], [1, 1, 1]],
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f

/** Sample a list of evenly-spaced RGB stops at t (0..1, clamped). */
export function sampleStops(stops: RGB[], t: number): RGB {
  if (stops.length === 1) return stops[0]
  const x = clamp01(t) * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const f = x - i
  const a = stops[i]
  const b = stops[i + 1]
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]
}

// Accept the Color node's [r,g,b,a] array (or a bare [r,g,b]); fall back otherwise.
function toRGB(value: unknown, fallback: RGB): RGB {
  if (Array.isArray(value) && value.length >= 3) {
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0]
  }
  return fallback
}

export const colorRampExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const tIn = (ctx.inputs.get('t') as number) ?? 0
  const preset = (ctx.controls.get('preset') as string) ?? 'viridis'
  const reverse = (ctx.controls.get('reverse') as boolean) ?? false

  let t = clamp01(tIn)
  if (reverse) t = 1 - t

  let rgb: RGB
  if (preset === 'custom') {
    const a = toRGB(ctx.inputs.get('colorA'), [0, 0, 0])
    const b = toRGB(ctx.inputs.get('colorB'), [1, 1, 1])
    rgb = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
  } else {
    rgb = sampleStops(PALETTES[preset] ?? PALETTES.viridis, t)
  }

  const [r, g, b] = rgb
  const outputs = new Map<string, unknown>()
  outputs.set('color', [r, g, b, 1])
  outputs.set('r', r)
  outputs.set('g', g)
  outputs.set('b', b)
  return outputs
}
