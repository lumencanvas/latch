/**
 * Utility Executor Tests
 *
 * Tests for value checking, type comparison, and flow control node executors
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  isNullExecutor,
  isEmptyExecutor,
  passIfExecutor,
  defaultValueExecutor,
  coalesceExecutor,
  equalsExecutor,
  typeOfExecutor,
  inRangeExecutor,
  changedExecutor,
  sampleHoldExecutor,
  latchExecutor,
  routerExecutor,
  counterExecutor,
  debounceExecutor,
  throttleExecutor,
  disposeAllUtilityState,
} from '@/engine/executors/utility'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Helper to create a mock execution context
function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'test-node',
  totalTime = 0
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime,
    frameCount: 0,
  }
}

describe('Utility Executors', () => {
  beforeEach(() => {
    // Clear state between tests
    disposeAllUtilityState()
  })

  // ============================================================================
  // Is Null
  // ============================================================================
  describe('isNullExecutor', () => {
    it('returns true for null', () => {
      const ctx = createContext({ value: null })
      const result = isNullExecutor(ctx)
      expect(result.get('result')).toBe(1)
    })

    it('returns true for undefined', () => {
      const ctx = createContext({ value: undefined })
      const result = isNullExecutor(ctx)
      expect(result.get('result')).toBe(1)
    })

    it('returns true for missing value', () => {
      const ctx = createContext({})
      const result = isNullExecutor(ctx)
      expect(result.get('result')).toBe(1)
    })

    it('returns false for valid values', () => {
      expect(isNullExecutor(createContext({ value: 0 })).get('result')).toBe(0)
      expect(isNullExecutor(createContext({ value: '' })).get('result')).toBe(0)
      expect(isNullExecutor(createContext({ value: false })).get('result')).toBe(0)
      expect(isNullExecutor(createContext({ value: [] })).get('result')).toBe(0)
      expect(isNullExecutor(createContext({ value: {} })).get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Is Empty
  // ============================================================================
  describe('isEmptyExecutor', () => {
    it('returns true for null with correct type', () => {
      const ctx = createContext({ value: null })
      const result = isEmptyExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('type')).toBe('null')
    })

    it('returns true for undefined with correct type', () => {
      const ctx = createContext({ value: undefined })
      const result = isEmptyExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('type')).toBe('undefined')
    })

    it('returns true for empty string with correct type', () => {
      const ctx = createContext({ value: '' })
      const result = isEmptyExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('type')).toBe('empty-string')
    })

    it('returns true for empty array with correct type', () => {
      const ctx = createContext({ value: [] })
      const result = isEmptyExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('type')).toBe('empty-array')
    })

    it('returns false for non-empty values', () => {
      expect(isEmptyExecutor(createContext({ value: 'hello' })).get('result')).toBe(0)
      expect(isEmptyExecutor(createContext({ value: [1] })).get('result')).toBe(0)
      expect(isEmptyExecutor(createContext({ value: 0 })).get('result')).toBe(0)
      expect(isEmptyExecutor(createContext({ value: {} })).get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Pass If
  // ============================================================================
  describe('passIfExecutor', () => {
    describe('when-true mode', () => {
      it('passes value when condition is true', () => {
        const ctx = createContext({ value: 'hello', condition: true }, { mode: 'when-true' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })

      it('blocks value when condition is false', () => {
        const ctx = createContext({ value: 'hello', condition: false }, { mode: 'when-true' })
        const result = passIfExecutor(ctx)
        expect(result.has('result')).toBe(false)
      })

      it('treats truthy values as true', () => {
        const ctx = createContext({ value: 'hello', condition: 1 }, { mode: 'when-true' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })
    })

    describe('when-false mode', () => {
      it('passes value when condition is false', () => {
        const ctx = createContext({ value: 'hello', condition: false }, { mode: 'when-false' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })

      it('blocks value when condition is true', () => {
        const ctx = createContext({ value: 'hello', condition: true }, { mode: 'when-false' })
        const result = passIfExecutor(ctx)
        expect(result.has('result')).toBe(false)
      })
    })

    describe('when-not-null mode', () => {
      it('passes value when not null', () => {
        const ctx = createContext({ value: 'hello' }, { mode: 'when-not-null' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })

      it('blocks null values', () => {
        const ctx = createContext({ value: null }, { mode: 'when-not-null' })
        const result = passIfExecutor(ctx)
        expect(result.has('result')).toBe(false)
      })

      it('passes empty string (not null)', () => {
        const ctx = createContext({ value: '' }, { mode: 'when-not-null' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('')
      })
    })

    describe('when-not-empty mode', () => {
      it('passes non-empty values', () => {
        const ctx = createContext({ value: 'hello' }, { mode: 'when-not-empty' })
        const result = passIfExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })

      it('blocks empty strings', () => {
        const ctx = createContext({ value: '' }, { mode: 'when-not-empty' })
        const result = passIfExecutor(ctx)
        expect(result.has('result')).toBe(false)
      })

      it('blocks empty arrays', () => {
        const ctx = createContext({ value: [] }, { mode: 'when-not-empty' })
        const result = passIfExecutor(ctx)
        expect(result.has('result')).toBe(false)
      })
    })
  })

  // ============================================================================
  // Default Value
  // ============================================================================
  describe('defaultValueExecutor', () => {
    it('returns value when not null', () => {
      const ctx = createContext({ value: 'hello' }, { default: 'fallback' })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toBe('hello')
    })

    it('returns default when value is null', () => {
      const ctx = createContext({ value: null }, { default: 'fallback' })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toBe('fallback')
    })

    it('returns default when value is undefined', () => {
      const ctx = createContext({}, { default: 'fallback' })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toBe('fallback')
    })

    it('returns default for empty string when treatEmptyAsNull is true', () => {
      const ctx = createContext({ value: '' }, { default: 'fallback', treatEmptyAsNull: true })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toBe('fallback')
    })

    it('returns empty string when treatEmptyAsNull is false', () => {
      const ctx = createContext({ value: '' }, { default: 'fallback', treatEmptyAsNull: false })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toBe('')
    })

    it('parses JSON default', () => {
      const ctx = createContext({ value: null }, { default: '{"key": "value"}' })
      const result = defaultValueExecutor(ctx)
      expect(result.get('result')).toEqual({ key: 'value' })
    })
  })

  // ============================================================================
  // Coalesce
  // ============================================================================
  describe('coalesceExecutor', () => {
    it('returns first non-null value', () => {
      const ctx = createContext({ a: null, b: undefined, c: 'found', d: 'also' })
      const result = coalesceExecutor(ctx)
      expect(result.get('result')).toBe('found')
    })

    it('returns first value if not null', () => {
      const ctx = createContext({ a: 'first', b: 'second' })
      const result = coalesceExecutor(ctx)
      expect(result.get('result')).toBe('first')
    })

    it('returns null if all values are null', () => {
      const ctx = createContext({ a: null, b: null })
      const result = coalesceExecutor(ctx)
      expect(result.get('result')).toBe(null)
    })

    it('handles falsy non-null values', () => {
      const ctx = createContext({ a: null, b: 0, c: 'third' })
      const result = coalesceExecutor(ctx)
      expect(result.get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Equals
  // ============================================================================
  describe('equalsExecutor', () => {
    describe('strict mode', () => {
      it('compares strings', () => {
        expect(equalsExecutor(createContext({ a: 'hello', b: 'hello' }, { strict: true })).get('result')).toBe(1)
        expect(equalsExecutor(createContext({ a: 'hello', b: 'world' }, { strict: true })).get('result')).toBe(0)
      })

      it('compares numbers', () => {
        expect(equalsExecutor(createContext({ a: 42, b: 42 }, { strict: true })).get('result')).toBe(1)
        expect(equalsExecutor(createContext({ a: 42, b: 43 }, { strict: true })).get('result')).toBe(0)
      })

      it('compares objects by value', () => {
        expect(equalsExecutor(createContext({ a: { x: 1 }, b: { x: 1 } }, { strict: true })).get('result')).toBe(1)
        expect(equalsExecutor(createContext({ a: { x: 1 }, b: { x: 2 } }, { strict: true })).get('result')).toBe(0)
      })

      it('compares arrays by value', () => {
        expect(equalsExecutor(createContext({ a: [1, 2], b: [1, 2] }, { strict: true })).get('result')).toBe(1)
        expect(equalsExecutor(createContext({ a: [1, 2], b: [1, 3] }, { strict: true })).get('result')).toBe(0)
      })
    })

    describe('non-strict mode', () => {
      it('uses loose equality', () => {
        expect(equalsExecutor(createContext({ a: '1', b: 1 }, { strict: false })).get('result')).toBe(1)
        expect(equalsExecutor(createContext({ a: null, b: undefined }, { strict: false })).get('result')).toBe(1)
      })
    })
  })

  // ============================================================================
  // Type Of
  // ============================================================================
  describe('typeOfExecutor', () => {
    it('returns correct types', () => {
      expect(typeOfExecutor(createContext({ value: 'hello' })).get('type')).toBe('string')
      expect(typeOfExecutor(createContext({ value: 42 })).get('type')).toBe('number')
      expect(typeOfExecutor(createContext({ value: true })).get('type')).toBe('boolean')
      expect(typeOfExecutor(createContext({ value: null })).get('type')).toBe('null')
      expect(typeOfExecutor(createContext({ value: undefined })).get('type')).toBe('undefined')
      expect(typeOfExecutor(createContext({ value: [] })).get('type')).toBe('array')
      expect(typeOfExecutor(createContext({ value: {} })).get('type')).toBe('object')
    })
  })

  // ============================================================================
  // In Range
  // ============================================================================
  describe('inRangeExecutor', () => {
    it('returns true when in range (inclusive)', () => {
      const ctx = createContext({ value: 5 }, { min: 0, max: 10, inclusive: true })
      expect(inRangeExecutor(ctx).get('result')).toBe(1)
    })

    it('returns true for boundary values (inclusive)', () => {
      expect(inRangeExecutor(createContext({ value: 0 }, { min: 0, max: 10, inclusive: true })).get('result')).toBe(1)
      expect(inRangeExecutor(createContext({ value: 10 }, { min: 0, max: 10, inclusive: true })).get('result')).toBe(1)
    })

    it('returns false for boundary values (exclusive)', () => {
      expect(inRangeExecutor(createContext({ value: 0 }, { min: 0, max: 10, inclusive: false })).get('result')).toBe(0)
      expect(inRangeExecutor(createContext({ value: 10 }, { min: 0, max: 10, inclusive: false })).get('result')).toBe(0)
    })

    it('returns false when out of range', () => {
      expect(inRangeExecutor(createContext({ value: -1 }, { min: 0, max: 10 })).get('result')).toBe(0)
      expect(inRangeExecutor(createContext({ value: 11 }, { min: 0, max: 10 })).get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Changed
  // ============================================================================
  describe('changedExecutor', () => {
    it('outputs value and changed=true on first call', () => {
      const ctx = createContext({ value: 'hello' }, {}, 'changed-test-1')
      const result = changedExecutor(ctx)
      expect(result.get('result')).toBe('hello')
      expect(result.get('changed')).toBe(1)
    })

    it('outputs changed=false when value stays same', () => {
      const nodeId = 'changed-test-2'
      changedExecutor(createContext({ value: 'hello' }, {}, nodeId))
      const result = changedExecutor(createContext({ value: 'hello' }, {}, nodeId))
      expect(result.get('changed')).toBe(0)
    })

    it('outputs changed=true when value changes', () => {
      const nodeId = 'changed-test-3'
      changedExecutor(createContext({ value: 'hello' }, {}, nodeId))
      const result = changedExecutor(createContext({ value: 'world' }, {}, nodeId))
      expect(result.get('result')).toBe('world')
      expect(result.get('changed')).toBe(1)
    })
  })

  // ============================================================================
  // Sample Hold
  // ============================================================================
  describe('sampleHoldExecutor', () => {
    it('samples value on trigger', () => {
      const nodeId = 'sample-hold-test-1'
      const result = sampleHoldExecutor(createContext({ value: 'captured', trigger: true }, {}, nodeId))
      expect(result.get('result')).toBe('captured')
    })

    it('holds value without trigger', () => {
      const nodeId = 'sample-hold-test-2'
      sampleHoldExecutor(createContext({ value: 'first', trigger: true }, {}, nodeId))
      const result = sampleHoldExecutor(createContext({ value: 'second', trigger: false }, {}, nodeId))
      expect(result.get('result')).toBe('first')
    })

    it('updates on new trigger', () => {
      const nodeId = 'sample-hold-test-3'
      sampleHoldExecutor(createContext({ value: 'first', trigger: true }, {}, nodeId))
      sampleHoldExecutor(createContext({ value: 'second', trigger: false }, {}, nodeId))
      const result = sampleHoldExecutor(createContext({ value: 'third', trigger: true }, {}, nodeId))
      expect(result.get('result')).toBe('third')
    })

    it('does NOT re-sample while trigger stays high (edge-triggered, not level)', () => {
      const nodeId = 'sample-hold-edge'
      // Rising edge captures 'a'...
      expect(sampleHoldExecutor(createContext({ value: 'a', trigger: true }, {}, nodeId)).get('result')).toBe('a')
      // ...trigger STILL high: a level-triggered impl would re-sample 'b'; edge-triggered holds 'a'.
      expect(sampleHoldExecutor(createContext({ value: 'b', trigger: true }, {}, nodeId)).get('result')).toBe('a')
      // Falls low (no sample), then a fresh rising edge captures 'c'.
      sampleHoldExecutor(createContext({ value: 'b', trigger: false }, {}, nodeId))
      expect(sampleHoldExecutor(createContext({ value: 'c', trigger: true }, {}, nodeId)).get('result')).toBe('c')
    })
  })

  // ============================================================================
  // Latch
  // ============================================================================
  describe('latchExecutor', () => {
    it('starts with initial state', () => {
      const result = latchExecutor(createContext({}, { initialState: true }, 'latch-test-1'))
      expect(result.get('result')).toBe(1)
    })

    it('sets on set trigger', () => {
      const nodeId = 'latch-test-2'
      latchExecutor(createContext({}, { initialState: false }, nodeId))
      const result = latchExecutor(createContext({ set: true }, {}, nodeId))
      expect(result.get('result')).toBe(1)
    })

    it('resets on reset trigger', () => {
      const nodeId = 'latch-test-3'
      latchExecutor(createContext({ set: true }, { initialState: false }, nodeId))
      const result = latchExecutor(createContext({ reset: true }, {}, nodeId))
      expect(result.get('result')).toBe(0)
    })

    it('reset takes priority over set', () => {
      const nodeId = 'latch-test-4'
      latchExecutor(createContext({ set: true }, { initialState: false }, nodeId))
      const result = latchExecutor(createContext({ set: true, reset: true }, {}, nodeId))
      expect(result.get('result')).toBe(0)
    })

    it('reset wins when set and reset rise on the same frame', () => {
      const nodeId = 'latch-both'
      const result = latchExecutor(createContext({ set: true, reset: true }, { initialState: false }, nodeId))
      expect(result.get('result')).toBe(0)
    })

    it('set is edge-triggered: a held-high set does not re-assert after a reset', () => {
      const nodeId = 'latch-edge'
      latchExecutor(createContext({ set: true }, { initialState: false }, nodeId)) // rising set -> latched
      latchExecutor(createContext({ set: true, reset: true }, {}, nodeId)) // reset rises (set held) -> cleared
      // set is STILL high (no new rising edge); a level-triggered impl would re-set to 1.
      const result = latchExecutor(createContext({ set: true }, {}, nodeId))
      expect(result.get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Router
  // ============================================================================
  describe('routerExecutor', () => {
    it('routes to out0', () => {
      const result = routerExecutor(createContext({ value: 'hello', route: 0 }))
      expect(result.get('out0')).toBe('hello')
      expect(result.has('out1')).toBe(false)
    })

    it('routes to out1', () => {
      const result = routerExecutor(createContext({ value: 'hello', route: 1 }))
      expect(result.get('out1')).toBe('hello')
      expect(result.has('out0')).toBe(false)
    })

    it('clamps route to valid range', () => {
      const result = routerExecutor(createContext({ value: 'hello', route: 10 }))
      expect(result.get('out3')).toBe('hello')
    })

    it('floors fractional routes', () => {
      const result = routerExecutor(createContext({ value: 'hello', route: 1.7 }))
      expect(result.get('out1')).toBe('hello')
    })
  })

  // ============================================================================
  // Counter
  // ============================================================================
  describe('counterExecutor', () => {
    it('increments on trigger', () => {
      const nodeId = 'counter-test-1'
      counterExecutor(createContext({}, { initial: 0 }, nodeId))
      const result = counterExecutor(createContext({ increment: true }, {}, nodeId))
      expect(result.get('count')).toBe(1)
    })

    it('decrements on trigger', () => {
      const nodeId = 'counter-test-2'
      counterExecutor(createContext({}, { initial: 5 }, nodeId))
      const result = counterExecutor(createContext({ decrement: true }, {}, nodeId))
      expect(result.get('count')).toBe(4)
    })

    it('resets on trigger', () => {
      const nodeId = 'counter-test-3'
      counterExecutor(createContext({ increment: true }, { initial: 0 }, nodeId))
      counterExecutor(createContext({ increment: true }, {}, nodeId))
      const result = counterExecutor(createContext({ reset: true }, { initial: 0 }, nodeId))
      expect(result.get('count')).toBe(0)
    })

    it('respects max limit', () => {
      const nodeId = 'counter-test-4'
      counterExecutor(createContext({}, { initial: 9, max: 10, wrap: false }, nodeId))
      const result = counterExecutor(createContext({ increment: true }, { max: 10, wrap: false }, nodeId))
      expect(result.get('count')).toBe(10)
      const result2 = counterExecutor(createContext({ increment: true }, { max: 10, wrap: false }, nodeId))
      expect(result2.get('count')).toBe(10)
    })

    it('wraps when enabled', () => {
      const nodeId = 'counter-test-5'
      counterExecutor(createContext({}, { initial: 10, min: 0, max: 10, wrap: true }, nodeId))
      const result = counterExecutor(createContext({ increment: true }, { min: 0, max: 10, wrap: true }, nodeId))
      expect(result.get('count')).toBe(0)
    })
  })

  // ============================================================================
  // Throttle
  // ============================================================================
  describe('throttleExecutor', () => {
    it('passes first value immediately', () => {
      const result = throttleExecutor(createContext({ value: 'first' }, { interval: 100 }, 'throttle-test-1', 0))
      expect(result.get('result')).toBe('first')
    })

    it('throttles subsequent calls', () => {
      const nodeId = 'throttle-test-2'
      throttleExecutor(createContext({ value: 'first' }, { interval: 100 }, nodeId, 0))
      const result = throttleExecutor(createContext({ value: 'second' }, { interval: 100 }, nodeId, 0.05))
      expect(result.get('result')).toBe('first') // Still returns old value
    })

    it('passes value after interval', () => {
      const nodeId = 'throttle-test-3'
      throttleExecutor(createContext({ value: 'first' }, { interval: 100 }, nodeId, 0))
      const result = throttleExecutor(createContext({ value: 'second' }, { interval: 100 }, nodeId, 0.15))
      expect(result.get('result')).toBe('second')
    })
  })
})
