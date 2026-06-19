import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { functionExecutor, expressionExecutor } from '@/engine/executors/code'

function ctx(
  code: string,
  inputs: Record<string, unknown> = {},
  nodeId = 'code-test',
  controlKey: 'code' | 'expression' = 'code'
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map([[controlKey, code]]),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 1,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const run = (code: string, inputs: Record<string, unknown> = {}, nodeId?: string) =>
  functionExecutor(ctx(code, inputs, nodeId)) as Map<string, unknown>

describe('functionExecutor — legitimate code still works', () => {
  it('computes from inputs', () => {
    const out = run('return inputs.a + inputs.b', { a: 2, b: 3 })
    expect(out.get('result')).toBe(5)
    expect(out.get('error')).toBe(null)
  })

  it('exposes Math and the helper functions', () => {
    expect(run('return Math.max(1, 7, 3)').get('result')).toBe(7)
    expect(run('return clamp(5, 0, 1)').get('result')).toBe(1)
    expect(run('return lerp(0, 10, 0.5)').get('result')).toBe(5)
  })

  it('persists state across frames via getState/setState', () => {
    run('setState("n", (getState("n", 0)) + 1)', {}, 'stateful')
    run('setState("n", (getState("n", 0)) + 1)', {}, 'stateful')
    expect(run('return getState("n", 0)', {}, 'stateful').get('result')).toBe(2)
  })

  it('spreads a returned object into multiple outputs', () => {
    const out = run('return { x: 1, y: 2 }')
    expect(out.get('x')).toBe(1)
    expect(out.get('y')).toBe(2)
  })
})

describe('functionExecutor — host globals are shadowed (defense-in-depth)', () => {
  for (const g of ['window', 'document', 'fetch', 'localStorage', 'XMLHttpRequest', 'WebSocket', 'electronAPI', 'globalThis', 'navigator', 'indexedDB']) {
    it(`\`${g}\` is undefined inside node code`, () => {
      expect(run(`return typeof ${g}`).get('result')).toBe('undefined')
    })
  }

  it('touching a shadowed global throws into the error output (no crash)', () => {
    const out = run('return fetch("http://evil.test")')
    expect(out.get('result')).toBe(null)
    expect(typeof out.get('error')).toBe('string') // TypeError: fetch is not a function
  })
})

describe('expressionExecutor', () => {
  const expr = (e: string, inputs: Record<string, unknown> = {}) =>
    expressionExecutor(ctx(e, inputs, 'expr-test', 'expression')) as Map<string, unknown>

  it('evaluates math over a/b/c/d', () => {
    expect(expr('a * b + c', { a: 2, b: 3, c: 1 }).get('result')).toBe(7)
  })

  it('exposes math helpers and shadows globals', () => {
    expect(expr('sin(0)').get('result')).toBe(0)
    expect(expr('clamp(9, 0, 1)').get('result')).toBe(1)
    // a blocked global makes the expression non-numeric → coerced to 0, error set
    const out = expr('(typeof fetch === "undefined") ? 42 : 0')
    expect(out.get('result')).toBe(42)
  })
})
