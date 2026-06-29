import { describe, it, expect } from 'vitest'
import { TRIGGER, isHigh, risingEdge } from '@/engine/trigger'

describe('trigger helpers', () => {
  it('TRIGGER is the canonical fired value 1', () => {
    expect(TRIGGER).toBe(1)
  })

  it('isHigh accepts true / any positive number, rejects everything else', () => {
    expect(isHigh(true)).toBe(true)
    expect(isHigh(1)).toBe(true)
    expect(isHigh(0.5)).toBe(true)
    expect(isHigh(0)).toBe(false)
    expect(isHigh(-1)).toBe(false)
    expect(isHigh(false)).toBe(false)
    expect(isHigh('1')).toBe(false) // strings are not levels
    expect(isHigh(null)).toBe(false)
    expect(isHigh(undefined)).toBe(false)
  })

  it('risingEdge fires only on the low->high transition', () => {
    const id = 'nodeA'
    expect(risingEdge(id, 'set', 0)).toBe(false) // starts low
    expect(risingEdge(id, 'set', 1)).toBe(true) // rise
    expect(risingEdge(id, 'set', 1)).toBe(false) // sustained high — no re-fire
    expect(risingEdge(id, 'set', 0)).toBe(false) // fall
    expect(risingEdge(id, 'set', 1)).toBe(true) // rises again
  })

  it('tracks independent edge state per key and per node', () => {
    expect(risingEdge('n1', 'a', 1)).toBe(true)
    expect(risingEdge('n1', 'b', 1)).toBe(true) // different key → own state
    expect(risingEdge('n2', 'a', 1)).toBe(true) // different node → own state
    expect(risingEdge('n1', 'a', 1)).toBe(false) // n1/a still high
  })
})
