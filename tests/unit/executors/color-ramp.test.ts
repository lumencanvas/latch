import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { colorRampExecutor, sampleStops, PALETTES } from '@/engine/executors/color-ramp'

function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'color-ramp-test'
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const run = (inputs: Record<string, unknown>, controls: Record<string, unknown> = {}) =>
  colorRampExecutor(createContext(inputs, controls)) as Map<string, unknown>

describe('colorRampExecutor', () => {
  it('outputs an [r,g,b,a] colour matching the Color node shape, alpha 1', () => {
    const color = run({ t: 0.5 }, { preset: 'grayscale' }).get('color') as number[]
    expect(Array.isArray(color)).toBe(true)
    expect(color).toHaveLength(4)
    expect(color[3]).toBe(1)
  })

  it('grayscale maps t=0 to black and t=1 to white', () => {
    expect(run({ t: 0 }, { preset: 'grayscale' }).get('color')).toEqual([0, 0, 0, 1])
    expect(run({ t: 1 }, { preset: 'grayscale' }).get('color')).toEqual([1, 1, 1, 1])
  })

  it('separate r/g/b outputs equal the colour channels', () => {
    const out = run({ t: 0.5 }, { preset: 'grayscale' })
    expect(out.get('r')).toBeCloseTo(0.5, 6)
    expect(out.get('g')).toBeCloseTo(0.5, 6)
    expect(out.get('b')).toBeCloseTo(0.5, 6)
  })

  it('keeps every channel in [0,1] across all palettes and t', () => {
    for (const preset of Object.keys(PALETTES)) {
      for (let i = 0; i <= 20; i++) {
        const out = run({ t: i / 20 }, { preset })
        for (const ch of ['r', 'g', 'b'] as const) {
          const v = out.get(ch) as number
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('reverse flips the palette direction', () => {
    expect(run({ t: 0 }, { preset: 'grayscale', reverse: true }).get('color')).toEqual([1, 1, 1, 1])
    expect(run({ t: 1 }, { preset: 'grayscale', reverse: true }).get('color')).toEqual([0, 0, 0, 1])
  })

  it('clamps t outside [0,1]', () => {
    expect(run({ t: -5 }, { preset: 'grayscale' }).get('color')).toEqual([0, 0, 0, 1])
    expect(run({ t: 9 }, { preset: 'grayscale' }).get('color')).toEqual([1, 1, 1, 1])
  })

  it('custom preset interpolates between Color A and Color B inputs', () => {
    const out = run(
      { t: 0.5, colorA: [0, 0, 0, 1], colorB: [1, 0, 0, 1] },
      { preset: 'custom' }
    ).get('color') as number[]
    expect(out[0]).toBeCloseTo(0.5, 6)
    expect(out[1]).toBe(0)
    expect(out[2]).toBe(0)
  })

  it('custom preset defaults to black→white when no colours are connected', () => {
    expect(run({ t: 0 }, { preset: 'custom' }).get('color')).toEqual([0, 0, 0, 1])
    expect(run({ t: 1 }, { preset: 'custom' }).get('color')).toEqual([1, 1, 1, 1])
  })

  it('falls back to viridis for an unknown preset', () => {
    const unknown = run({ t: 0.3 }, { preset: 'bogus' }).get('color')
    const viridis = run({ t: 0.3 }, { preset: 'viridis' }).get('color')
    expect(unknown).toEqual(viridis)
  })

  it('sampleStops returns endpoints exactly', () => {
    const stops = PALETTES.rainbow
    expect(sampleStops(stops, 0)).toEqual(stops[0])
    expect(sampleStops(stops, 1)).toEqual(stops[stops.length - 1])
  })
})
