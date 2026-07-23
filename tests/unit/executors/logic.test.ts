import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { gateExecutor } from '@/engine/executors/logic'

function mkCtx(nodeId: string, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    deltaTime: 0.016,
    totalTime: 1,
    frameCount: 0,
  } as unknown as ExecutionContext
}

/**
 * gateExecutor is sample-and-hold: it passes the value while the gate is OPEN and HOLDS the last
 * passed value while CLOSED. It was entirely untested. These pin the open/closed behavior, the
 * numeric-vs-boolean gate (a strict `=== true` would break the canonical numeric trigger), the
 * hold-through-undefined, and the value-control fallback.
 */
describe('gateExecutor — sample-and-hold', () => {
  it('passes value while open and HOLDS the last value while closed (boolean gate)', () => {
    const id = 'gate-bool'
    expect(gateExecutor(mkCtx(id, { value: 10, gate: true })).get('result')).toBe(10) // open → pass
    expect(gateExecutor(mkCtx(id, { value: 20, gate: false })).get('result')).toBe(10) // closed → hold 10
    expect(gateExecutor(mkCtx(id, { value: 30, gate: true })).get('result')).toBe(30) // open → pass 30
  })

  it('treats a NUMERIC gate (1/0) like true/false', () => {
    const id = 'gate-num'
    expect(gateExecutor(mkCtx(id, { value: 5, gate: 1 })).get('result')).toBe(5) // 1 → open
    expect(gateExecutor(mkCtx(id, { value: 9, gate: 0 })).get('result')).toBe(5) // 0 → closed, hold 5
  })

  it('holds undefined until first opened with a defined value', () => {
    const id = 'gate-empty'
    expect(gateExecutor(mkCtx(id, { gate: false })).get('result')).toBeUndefined() // never opened
    expect(gateExecutor(mkCtx(id, { gate: true })).get('result')).toBeUndefined() // open but no value → stores nothing
    expect(gateExecutor(mkCtx(id, { value: 7, gate: true })).get('result')).toBe(7)
  })

  it('defaults the gate OPEN and falls back to the value control when no value input', () => {
    const id = 'gate-ctrl'
    // no gate input → Boolean(undefined ?? undefined ?? true) = open; value comes from the control
    expect(gateExecutor(mkCtx(id, {}, { value: 'held' })).get('result')).toBe('held')
  })
})
