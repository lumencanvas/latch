import { describe, it, expect } from 'vitest'
import { makeContext } from '../_helpers/executionContext'

/**
 * Typed input accessors on ExecutionContext (EXTENSIBILITY §5.2). Each reads
 * `input ?? control` for the id, then the supplied fallback.
 */
function ctx(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'n',
) {
  return makeContext(inputs, controls, { nodeId })
}

describe('createExecutionContext typed accessors', () => {
  describe('num', () => {
    it('reads a number, coerces boolean/string', () => {
      expect(ctx({ x: 5 }).num('x')).toBe(5)
      expect(ctx({ x: true }).num('x')).toBe(1)
      expect(ctx({ x: '4.5' }).num('x')).toBe(4.5)
    })

    it('falls back when missing or non-finite', () => {
      expect(ctx().num('x', 9)).toBe(9)
      expect(ctx({ x: 'abc' }).num('x', 9)).toBe(9)
      expect(ctx({ x: Infinity }).num('x', 9)).toBe(9)
      expect(ctx().num('x')).toBe(0) // default fallback
    })

    it('prefers input, then control, then fallback', () => {
      expect(ctx({ x: 1 }, { x: 2 }).num('x', 3)).toBe(1)
      expect(ctx({}, { x: 2 }).num('x', 3)).toBe(2)
    })
  })

  describe('bool', () => {
    it('coerces and falls back', () => {
      expect(ctx({ x: 1 }).bool('x')).toBe(true)
      expect(ctx({ x: 0 }).bool('x')).toBe(false)
      expect(ctx({ x: 'true' }).bool('x')).toBe(true)
      expect(ctx().bool('x', true)).toBe(true)
    })
  })

  describe('str', () => {
    it('coerces and falls back', () => {
      expect(ctx({ x: 5 }).str('x')).toBe('5')
      expect(ctx({ x: true }).str('x')).toBe('true')
      expect(ctx().str('x', 'd')).toBe('d')
    })
  })

  describe('level (isHigh)', () => {
    it('treats positive numbers and true as high', () => {
      expect(ctx({ g: 1 }).level('g')).toBe(true)
      expect(ctx({ g: 0 }).level('g')).toBe(false)
      expect(ctx({ g: true }).level('g')).toBe(true)
    })
  })

  describe('trig (risingEdge)', () => {
    it('fires only on the low→high transition', () => {
      const id = 'trig-accessor-test-node'
      expect(ctx({ g: 0 }, {}, id).trig('g')).toBe(false)
      expect(ctx({ g: 1 }, {}, id).trig('g')).toBe(true) // rising
      expect(ctx({ g: 1 }, {}, id).trig('g')).toBe(false) // held high
      expect(ctx({ g: 0 }, {}, id).trig('g')).toBe(false) // falling
      expect(ctx({ g: 1 }, {}, id).trig('g')).toBe(true) // rising again
    })
  })
})
