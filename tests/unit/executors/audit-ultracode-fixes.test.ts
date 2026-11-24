/**
 * Regression pins for the 2026-07-23 ultracode-audit fixes (see docs/AUDIT_2026-07-23.md
 * addendum). Each test would FAIL against the pre-fix code.
 */
import { describe, it, expect } from 'vitest'
import { createExecutionContext, type ExecutionContext } from '@/engine/ExecutionEngine'
import smoothstepNode from '@/registry/math/smoothstep/node'
import divideNode from '@/registry/math/divide/node'
import wrapNode from '@/registry/math/wrap/node'
import selectNode from '@/registry/logic/select/node'
import stringMatchNode from '@/registry/string/string-match/node'
import { setByPath, getByPath } from '@/registry/data/pathHelpers'

function ctx(inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return createExecutionContext({
    nodeId: 'test-node',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 0,
    definition: {} as never,
  })
}
const run = (n: { executor: (c: ExecutionContext) => unknown }, i = {}, c = {}) =>
  n.executor(ctx(i, c)) as Map<string, unknown>

describe('math finite-guards (NaN must not propagate)', () => {
  it('smoothstep: edge0 === edge1 does not divide-by-zero → finite result', () => {
    const r = run(smoothstepNode, { value: 5 }, { edge0: 2, edge1: 2 })
    expect(Number.isFinite(r.get('result') as number)).toBe(true)
    expect(r.get('result')).toBe(1) // value >= edge → 1 (hard step)
    expect(run(smoothstepNode, { value: 1 }, { edge0: 2, edge1: 2 }).get('result')).toBe(0)
  })

  it('smoothstep: normal interpolation still works', () => {
    expect(run(smoothstepNode, { value: 0.5 }, { edge0: 0, edge1: 1 }).get('result')).toBeCloseTo(0.5)
  })

  it('divide: a NaN/∞ operand yields 0, not a non-finite result', () => {
    expect(run(divideNode, { a: NaN, b: 2 }).get('result')).toBe(0)
    expect(run(divideNode, { a: 6, b: 0 }).get('result')).toBe(0)
    expect(run(divideNode, { a: 6, b: 3 }).get('result')).toBe(2) // normal path intact
  })

  it('wrap: a non-finite input value yields min, not NaN', () => {
    expect(run(wrapNode, { value: NaN }, { min: 0, max: 10 }).get('result')).toBe(0)
    expect(run(wrapNode, { value: 12 }, { min: 0, max: 10 }).get('result')).toBe(2) // normal wrap intact
  })
})

describe('select maps Index to the labeled ports (no gap collapse)', () => {
  it('with A and C connected, Index 2 returns C (not the old collapsed B)', () => {
    const i = { a: 10, c: 30 } // b, d unconnected
    expect(run(selectNode, { ...i, index: 0 }).get('result')).toBe(10) // A
    expect(run(selectNode, { ...i, index: 1 }).get('result')).toBeUndefined() // B (unconnected)
    expect(run(selectNode, { ...i, index: 2 }).get('result')).toBe(30) // C — was wrongly collapsed before
    expect(run(selectNode, { ...i, index: 9 }).get('result')).toBeUndefined() // clamps to D (unconnected)
  })
})

describe('string-match capture groups with the g flag', () => {
  it('returns real capture groups + full match even when flags include g', () => {
    const r = run(stringMatchNode, { input: 'abc123' }, { pattern: '([a-z]+)(\\d+)', flags: 'g' })
    expect(r.get('match')).toBe(1)
    expect(r.get('fullMatch')).toBe('abc123')
    expect(r.get('groups')).toEqual(['abc', '123']) // pre-fix: garbage (array of full matches)
  })
})

describe('setByPath prototype-pollution guard', () => {
  it('rejects a __proto__ path and does not pollute Object.prototype', () => {
    const out = setByPath({}, '__proto__.polluted', 'x') as Record<string, unknown>
    expect(({} as Record<string, unknown>).polluted).toBeUndefined() // no global pollution
    expect(out.polluted).toBeUndefined()
  })
  it('rejects constructor/prototype segments too', () => {
    // Without the guard this path does NOT pollute Object.prototype (the walk copies into a
    // fresh own `constructor` object), so asserting "no global pollution" alone passed against
    // the unguarded code. Pin the guard itself: the object comes back UNCHANGED (same ref), and
    // no own `constructor`/`prototype` key was ever written.
    const input = { a: 1 }
    const out = setByPath(input, 'constructor.prototype.polluted2', 'y') as Record<string, unknown>
    expect(out).toBe(input)
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false)
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined()
    expect(setByPath(input, 'a.prototype', 'z')).toBe(input)
  })
  it('still sets ordinary nested paths and round-trips', () => {
    const out = setByPath({}, 'a.b.c', 42)
    expect(getByPath(out, 'a.b.c').value).toBe(42)
  })
})
