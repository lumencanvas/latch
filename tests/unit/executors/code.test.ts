import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { functionExecutor, expressionExecutor, counterExecutor, toggleExecutor, valueDelayExecutor, templateExecutor } from '@/engine/executors/code'

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
  // Includes the Electron-bridge escape vectors (require/process/module/Worker/
  // importScripts/global) — the whole reason the preamble exists — not just DOM.
  for (const g of [
    'window', 'document', 'fetch', 'localStorage', 'sessionStorage', 'XMLHttpRequest',
    'WebSocket', 'EventSource', 'electronAPI', 'globalThis', 'self', 'navigator',
    'indexedDB', 'caches', 'location', 'require', 'process', 'module', 'exports',
    'global', 'Worker', 'SharedWorker', 'importScripts',
  ]) {
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

  it('coerces a non-numeric/erroring expression to 0 and reports the error', () => {
    const out = expr('a +', { a: 1 }) // syntax error
    expect(out.get('result')).toBe(0)
    expect(typeof out.get('error')).toBe('string')
  })
})

// ── Stateful edge-triggered code nodes (counter / toggle / value-delay) — previously untested ──
function stCtx(nodeId: string, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    deltaTime: 0.016,
    totalTime: 1,
    frameCount: 0,
  } as unknown as ExecutionContext
}

describe('counterExecutor — edge-triggered counting', () => {
  it('increments once per RISING edge, not while held high (numeric 1)', () => {
    const id = 'ctr-num'
    expect(counterExecutor(stCtx(id, { increment: 1 })).get('count')).toBe(1) // rising edge
    expect(counterExecutor(stCtx(id, { increment: 1 })).get('count')).toBe(1) // held high → no re-count
    counterExecutor(stCtx(id, { increment: 0 })) // low
    expect(counterExecutor(stCtx(id, { increment: 1 })).get('count')).toBe(2) // new rising edge
  })

  it('works identically with boolean triggers', () => {
    const id = 'ctr-bool'
    expect(counterExecutor(stCtx(id, { increment: true })).get('count')).toBe(1)
    expect(counterExecutor(stCtx(id, { increment: true })).get('count')).toBe(1) // held
    counterExecutor(stCtx(id, { increment: false }))
    expect(counterExecutor(stCtx(id, { increment: true })).get('count')).toBe(2)
  })

  it('respects step and clamps at max (wrap off)', () => {
    const id = 'ctr-step'
    const c = { step: 5, min: 0, max: 8 }
    expect(counterExecutor(stCtx(id, { increment: 1 }, c)).get('count')).toBe(5)
    counterExecutor(stCtx(id, { increment: 0 }, c))
    expect(counterExecutor(stCtx(id, { increment: 1 }, c)).get('count')).toBe(8) // 10 clamped to max
  })

  it('wraps to min at max when wrap=true', () => {
    const id = 'ctr-wrap'
    const c = { min: 0, max: 1, wrap: true }
    counterExecutor(stCtx(id, { increment: 1 }, c)) // 1
    counterExecutor(stCtx(id, { increment: 0 }, c))
    expect(counterExecutor(stCtx(id, { increment: 1 }, c)).get('count')).toBe(0) // wraps
  })

  it('resets to min on a rising edge and set forces an absolute value', () => {
    const id = 'ctr-rs'
    counterExecutor(stCtx(id, { increment: 1 }))
    counterExecutor(stCtx(id, { increment: 0 }))
    counterExecutor(stCtx(id, { increment: 1 })) // count 2
    expect(counterExecutor(stCtx(id, { reset: 1 })).get('count')).toBe(0)
    expect(counterExecutor(stCtx(id, { set: 42 })).get('count')).toBe(42)
  })
})

describe('toggleExecutor — flips on rising edge', () => {
  it('flips once per rising edge, not while held (numeric 1)', () => {
    const id = 'tg-num'
    expect(toggleExecutor(stCtx(id, { trigger: 1 })).get('value')).toBe(true)
    expect(toggleExecutor(stCtx(id, { trigger: 1 })).get('value')).toBe(true) // held → no flip
    toggleExecutor(stCtx(id, { trigger: 0 }))
    expect(toggleExecutor(stCtx(id, { trigger: 1 })).get('value')).toBe(false) // flips back
  })

  it('set forces true, reset forces false, number output tracks state', () => {
    const id = 'tg-sr'
    expect(toggleExecutor(stCtx(id, { set: 1 })).get('number')).toBe(1)
    expect(toggleExecutor(stCtx(id, { reset: 1 })).get('number')).toBe(0)
  })
})

describe('valueDelayExecutor — delays a value by N frames', () => {
  it('frames=1 outputs the previous frame value', () => {
    const id = 'vd1'
    valueDelayExecutor(stCtx(id, { input: 'A' }, { frames: 1 })) // warm-up
    expect(valueDelayExecutor(stCtx(id, { input: 'B' }, { frames: 1 })).get('output')).toBe('A')
    expect(valueDelayExecutor(stCtx(id, { input: 'C' }, { frames: 1 })).get('output')).toBe('B')
  })

  it('frames=2 delays by two frames', () => {
    const id = 'vd2'
    valueDelayExecutor(stCtx(id, { input: 1 }, { frames: 2 }))
    valueDelayExecutor(stCtx(id, { input: 2 }, { frames: 2 }))
    expect(valueDelayExecutor(stCtx(id, { input: 3 }, { frames: 2 })).get('output')).toBe(1)
  })
})

describe('templateExecutor — {{key}} interpolation', () => {
  const out = (template: string, inputs: Record<string, unknown> = {}) =>
    templateExecutor(stCtx('tmpl', inputs, { template })).get('output')

  it('substitutes input placeholders', () => {
    expect(out('hello {{name}}', { name: 'world' })).toBe('hello world')
  })
  it('formats numeric inputs to 2 decimals', () => {
    expect(out('x={{x}}', { x: 3 })).toBe('x=3.00')
    expect(out('x={{x}}', { x: 1.2345 })).toBe('x=1.23')
  })
  it('leaves an unknown placeholder untouched (not blank)', () => {
    expect(out('{{missing}}', {})).toBe('{{missing}}')
  })
  it('exposes built-in time (2dp) and frame (numbers are 2dp-formatted)', () => {
    // time is pre-stringified ("1.00"); frame is a NUMBER (0) so the executor formats it to 2dp.
    expect(out('t={{time}} f={{frame}}')).toBe('t=1.00 f=0.00') // stCtx: totalTime 1, frame 0
  })
  it('empty template yields an empty string', () => {
    expect(out('')).toBe('')
  })
})
