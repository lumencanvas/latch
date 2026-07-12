import { describe, it, expect } from 'vitest'
import atan2Node from '@/registry/math/atan2/node'
import minNode from '@/registry/math/min/node'
import maxNode from '@/registry/math/max/node'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * Executor + spec tests for the co-located Phase-5 math primitives (atan2/min/max).
 * These have no separate entry in the legacy executor map — they ship only as
 * `registry/math/<id>/node.ts`, so the specs are exercised through their default export.
 */

function ctx(inputs: Record<string, unknown>): ExecutionContext {
  return {
    nodeId: 'test',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const run = (spec: typeof atan2Node, inputs: Record<string, unknown>) =>
  spec.executor(ctx(inputs)).get('result')

describe('math primitive: atan2', () => {
  it('is declared pure with Y and X inputs and an angle output', () => {
    expect(atan2Node.pure).toBe(true)
    expect(atan2Node.definition.id).toBe('atan2')
    expect(atan2Node.definition.inputs.map((p) => p.id)).toEqual(['y', 'x'])
    expect(atan2Node.definition.outputs[0].id).toBe('result')
  })

  it('returns the quadrant-aware angle in radians', () => {
    expect(run(atan2Node, { y: 0, x: 1 })).toBeCloseTo(0, 10)
    expect(run(atan2Node, { y: 1, x: 0 })).toBeCloseTo(Math.PI / 2, 10)
    // Second quadrant (y>0, x<0) — the case a plain atan() gets wrong.
    expect(run(atan2Node, { y: 1, x: -1 })).toBeCloseTo((3 * Math.PI) / 4, 10)
    // Arg order matters: atan2(1, 0) !== atan2(0, 1). Guards against a (x, y) swap.
    expect(run(atan2Node, { y: 1, x: 0 })).not.toBeCloseTo(run(atan2Node, { y: 0, x: 1 }) as number, 6)
  })

  it('defaults missing inputs to 0', () => {
    expect(run(atan2Node, {})).toBe(0)
  })
})

describe('math primitive: min', () => {
  it('is declared pure with two inputs', () => {
    expect(minNode.pure).toBe(true)
    expect(minNode.definition.inputs.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('returns the smaller of the two inputs', () => {
    expect(run(minNode, { a: 3, b: 7 })).toBe(3)
    expect(run(minNode, { a: -2, b: -9 })).toBe(-9)
    expect(run(minNode, { a: 5, b: 5 })).toBe(5)
  })

  it('defaults missing inputs to 0', () => {
    expect(run(minNode, { a: 4 })).toBe(0)
  })
})

describe('math primitive: max', () => {
  it('is declared pure with two inputs', () => {
    expect(maxNode.pure).toBe(true)
    expect(maxNode.definition.inputs.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('returns the larger of the two inputs', () => {
    expect(run(maxNode, { a: 3, b: 7 })).toBe(7)
    expect(run(maxNode, { a: -2, b: -9 })).toBe(-2)
    expect(run(maxNode, { a: 5, b: 5 })).toBe(5)
  })

  it('defaults missing inputs to 0', () => {
    expect(run(maxNode, { b: -4 })).toBe(0)
  })
})
