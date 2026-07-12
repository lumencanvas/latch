/**
 * Data Executor Tests
 *
 * Tests for array, object, and type conversion node executors
 */

import { describe, it, expect } from 'vitest'
// These data nodes are co-located (Phase 6); their executors ship on the node.ts
// default export, not the legacy executor barrel. Alias so call sites are unchanged.
import arrayLengthNode from '@/registry/data/array-length/node'
import arrayGetNode from '@/registry/data/array-get/node'
import arrayFirstLastNode from '@/registry/data/array-first-last/node'
import arrayContainsNode from '@/registry/data/array-contains/node'
import arraySliceNode from '@/registry/data/array-slice/node'
import arrayJoinNode from '@/registry/data/array-join/node'
import arrayReverseNode from '@/registry/data/array-reverse/node'
import arrayPushNode from '@/registry/data/array-push/node'
import arrayFilterNullsNode from '@/registry/data/array-filter-nulls/node'
import arrayUniqueNode from '@/registry/data/array-unique/node'
import arraySortNode from '@/registry/data/array-sort/node'
import arrayRangeNode from '@/registry/data/array-range/node'
import objectGetNode from '@/registry/data/object-get/node'
import objectSetNode from '@/registry/data/object-set/node'
import objectKeysNode from '@/registry/data/object-keys/node'
import objectValuesNode from '@/registry/data/object-values/node'
import objectHasNode from '@/registry/data/object-has/node'
import objectMergeNode from '@/registry/data/object-merge/node'
import objectCreateNode from '@/registry/data/object-create/node'
import objectEntriesNode from '@/registry/data/object-entries/node'
import toStringNode from '@/registry/data/to-string/node'
import toNumberNode from '@/registry/data/to-number/node'
import toBooleanNode from '@/registry/data/to-boolean/node'
import parseIntNode from '@/registry/data/parse-int/node'
import parseFloatNode from '@/registry/data/parse-float/node'
import toArrayNode from '@/registry/data/to-array/node'
import formatNumberNode from '@/registry/data/format-number/node'

const arrayLengthExecutor = arrayLengthNode.executor
const arrayGetExecutor = arrayGetNode.executor
const arrayFirstLastExecutor = arrayFirstLastNode.executor
const arrayContainsExecutor = arrayContainsNode.executor
const arraySliceExecutor = arraySliceNode.executor
const arrayJoinExecutor = arrayJoinNode.executor
const arrayReverseExecutor = arrayReverseNode.executor
const arrayPushExecutor = arrayPushNode.executor
const arrayFilterNullsExecutor = arrayFilterNullsNode.executor
const arrayUniqueExecutor = arrayUniqueNode.executor
const arraySortExecutor = arraySortNode.executor
const arrayRangeExecutor = arrayRangeNode.executor
const objectGetExecutor = objectGetNode.executor
const objectSetExecutor = objectSetNode.executor
const objectKeysExecutor = objectKeysNode.executor
const objectValuesExecutor = objectValuesNode.executor
const objectHasExecutor = objectHasNode.executor
const objectMergeExecutor = objectMergeNode.executor
const objectCreateExecutor = objectCreateNode.executor
const objectEntriesExecutor = objectEntriesNode.executor
const toStringExecutor = toStringNode.executor
const toNumberExecutor = toNumberNode.executor
const toBooleanExecutor = toBooleanNode.executor
const parseIntExecutor = parseIntNode.executor
const parseFloatExecutor = parseFloatNode.executor
const toArrayExecutor = toArrayNode.executor
const formatNumberExecutor = formatNumberNode.executor
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Helper to create a mock execution context
function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {}
): ExecutionContext {
  return {
    nodeId: 'test-node',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  }
}

describe('Data Executors', () => {
  // ============================================================================
  // Array Length
  // ============================================================================
  describe('arrayLengthExecutor', () => {
    it('returns length of array', () => {
      const result = arrayLengthExecutor(createContext({ array: [1, 2, 3] }))
      expect(result.get('length')).toBe(3)
      expect(result.get('isEmpty')).toBe(0)
    })

    it('returns 0 for empty array', () => {
      const result = arrayLengthExecutor(createContext({ array: [] }))
      expect(result.get('length')).toBe(0)
      expect(result.get('isEmpty')).toBe(1)
    })

    it('returns 0 for non-array', () => {
      const result = arrayLengthExecutor(createContext({ array: 'not an array' }))
      expect(result.get('length')).toBe(0)
      expect(result.get('isEmpty')).toBe(1)
    })
  })

  // ============================================================================
  // Array Get
  // ============================================================================
  describe('arrayGetExecutor', () => {
    it('gets element at index', () => {
      const result = arrayGetExecutor(createContext({ array: ['a', 'b', 'c'], index: 1 }))
      expect(result.get('value')).toBe('b')
      expect(result.get('found')).toBe(1)
    })

    it('supports negative indexing', () => {
      const result = arrayGetExecutor(createContext({ array: ['a', 'b', 'c'], index: -1 }))
      expect(result.get('value')).toBe('c')
      expect(result.get('found')).toBe(1)
    })

    it('returns default for out of bounds', () => {
      const result = arrayGetExecutor(createContext({ array: ['a'], index: 5 }, { default: 'fallback' }))
      expect(result.get('value')).toBe('fallback')
      expect(result.get('found')).toBe(0)
    })

    it('parses JSON default', () => {
      const result = arrayGetExecutor(createContext({ array: [], index: 0 }, { default: '{"key": 1}' }))
      expect(result.get('value')).toEqual({ key: 1 })
    })
  })

  // ============================================================================
  // Array First/Last
  // ============================================================================
  describe('arrayFirstLastExecutor', () => {
    it('returns first and last elements', () => {
      const result = arrayFirstLastExecutor(createContext({ array: [1, 2, 3] }))
      expect(result.get('first')).toBe(1)
      expect(result.get('last')).toBe(3)
      expect(result.get('length')).toBe(3)
    })

    it('handles empty array', () => {
      const result = arrayFirstLastExecutor(createContext({ array: [] }))
      expect(result.get('first')).toBeUndefined()
      expect(result.get('last')).toBeUndefined()
      expect(result.get('length')).toBe(0)
    })

    it('handles single element', () => {
      const result = arrayFirstLastExecutor(createContext({ array: ['only'] }))
      expect(result.get('first')).toBe('only')
      expect(result.get('last')).toBe('only')
    })
  })

  // ============================================================================
  // Array Contains
  // ============================================================================
  describe('arrayContainsExecutor', () => {
    it('finds primitive value', () => {
      const result = arrayContainsExecutor(createContext({ array: [1, 2, 3], value: 2 }))
      expect(result.get('result')).toBe(1)
      expect(result.get('index')).toBe(1)
    })

    it('finds object value', () => {
      const result = arrayContainsExecutor(createContext({
        array: [{ a: 1 }, { a: 2 }],
        value: { a: 2 }
      }))
      expect(result.get('result')).toBe(1)
      expect(result.get('index')).toBe(1)
    })

    it('returns -1 for not found', () => {
      const result = arrayContainsExecutor(createContext({ array: [1, 2, 3], value: 5 }))
      expect(result.get('result')).toBe(0)
      expect(result.get('index')).toBe(-1)
    })
  })

  // ============================================================================
  // Array Slice
  // ============================================================================
  describe('arraySliceExecutor', () => {
    it('slices array', () => {
      const result = arraySliceExecutor(createContext({ array: [1, 2, 3, 4, 5] }, { start: 1, end: 4 }))
      expect(result.get('result')).toEqual([2, 3, 4])
    })

    it('slices to end with -1', () => {
      const result = arraySliceExecutor(createContext({ array: [1, 2, 3, 4, 5] }, { start: 2, end: -1 }))
      expect(result.get('result')).toEqual([3, 4, 5])
    })
  })

  // ============================================================================
  // Array Join
  // ============================================================================
  describe('arrayJoinExecutor', () => {
    it('joins array with separator', () => {
      const result = arrayJoinExecutor(createContext({ array: ['a', 'b', 'c'] }, { separator: ', ' }))
      expect(result.get('result')).toBe('a, b, c')
    })

    it('uses default comma separator', () => {
      const result = arrayJoinExecutor(createContext({ array: [1, 2, 3] }))
      expect(result.get('result')).toBe('1,2,3')
    })
  })

  // ============================================================================
  // Array Reverse
  // ============================================================================
  describe('arrayReverseExecutor', () => {
    it('reverses array', () => {
      const result = arrayReverseExecutor(createContext({ array: [1, 2, 3] }))
      expect(result.get('result')).toEqual([3, 2, 1])
    })

    it('does not mutate original', () => {
      const original = [1, 2, 3]
      arrayReverseExecutor(createContext({ array: original }))
      expect(original).toEqual([1, 2, 3])
    })
  })

  // ============================================================================
  // Array Push
  // ============================================================================
  describe('arrayPushExecutor', () => {
    it('pushes to end', () => {
      const result = arrayPushExecutor(createContext({ array: [1, 2], value: 3 }, { position: 'end' }))
      expect(result.get('result')).toEqual([1, 2, 3])
    })

    it('pushes to start', () => {
      const result = arrayPushExecutor(createContext({ array: [1, 2], value: 0 }, { position: 'start' }))
      expect(result.get('result')).toEqual([0, 1, 2])
    })

    it('creates array if input is not array', () => {
      const result = arrayPushExecutor(createContext({ array: null, value: 'first' }))
      expect(result.get('result')).toEqual(['first'])
    })
  })

  // ============================================================================
  // Array Filter Nulls
  // ============================================================================
  describe('arrayFilterNullsExecutor', () => {
    it('removes null and undefined', () => {
      const result = arrayFilterNullsExecutor(createContext({ array: [1, null, 2, undefined, 3] }))
      expect(result.get('result')).toEqual([1, 2, 3])
      expect(result.get('removed')).toBe(2)
    })

    it('removes empty strings when enabled', () => {
      const result = arrayFilterNullsExecutor(createContext(
        { array: ['a', '', 'b', '', 'c'] },
        { removeEmpty: true }
      ))
      expect(result.get('result')).toEqual(['a', 'b', 'c'])
    })

    it('keeps empty strings when disabled', () => {
      const result = arrayFilterNullsExecutor(createContext(
        { array: ['a', '', 'b'] },
        { removeEmpty: false }
      ))
      expect(result.get('result')).toEqual(['a', '', 'b'])
    })
  })

  // ============================================================================
  // Array Unique
  // ============================================================================
  describe('arrayUniqueExecutor', () => {
    it('removes duplicates', () => {
      const result = arrayUniqueExecutor(createContext({ array: [1, 2, 2, 3, 3, 3] }))
      expect(result.get('result')).toEqual([1, 2, 3])
    })

    it('removes duplicate objects', () => {
      const result = arrayUniqueExecutor(createContext({
        array: [{ a: 1 }, { a: 1 }, { a: 2 }]
      }))
      expect(result.get('result')).toEqual([{ a: 1 }, { a: 2 }])
    })
  })

  // ============================================================================
  // Array Sort
  // ============================================================================
  describe('arraySortExecutor', () => {
    it('sorts numbers ascending', () => {
      const result = arraySortExecutor(createContext({ array: [3, 1, 2] }, { direction: 'ascending', type: 'numeric' }))
      expect(result.get('result')).toEqual([1, 2, 3])
    })

    it('sorts numbers descending', () => {
      const result = arraySortExecutor(createContext({ array: [1, 2, 3] }, { direction: 'descending', type: 'numeric' }))
      expect(result.get('result')).toEqual([3, 2, 1])
    })

    it('sorts strings alphabetically', () => {
      const result = arraySortExecutor(createContext({ array: ['c', 'a', 'b'] }, { direction: 'ascending', type: 'alphabetic' }))
      expect(result.get('result')).toEqual(['a', 'b', 'c'])
    })
  })

  // ============================================================================
  // Array Range
  // ============================================================================
  describe('arrayRangeExecutor', () => {
    it('generates range', () => {
      const result = arrayRangeExecutor(createContext({}, { start: 0, end: 5, step: 1 }))
      expect(result.get('result')).toEqual([0, 1, 2, 3, 4])
    })

    it('generates range with step', () => {
      const result = arrayRangeExecutor(createContext({}, { start: 0, end: 10, step: 2 }))
      expect(result.get('result')).toEqual([0, 2, 4, 6, 8])
    })

    it('generates descending range', () => {
      const result = arrayRangeExecutor(createContext({}, { start: 5, end: 0, step: 1 }))
      expect(result.get('result')).toEqual([5, 4, 3, 2, 1])
    })
  })

  // ============================================================================
  // Object Get
  // ============================================================================
  describe('objectGetExecutor', () => {
    it('gets property by path', () => {
      const result = objectGetExecutor(createContext(
        { object: { a: { b: { c: 'value' } } }, path: 'a.b.c' }
      ))
      expect(result.get('value')).toBe('value')
      expect(result.get('found')).toBe(1)
    })

    it('gets array element by bracket notation', () => {
      const result = objectGetExecutor(createContext(
        { object: { items: ['first', 'second'] }, path: 'items[1]' }
      ))
      expect(result.get('value')).toBe('second')
    })

    it('returns default for missing path', () => {
      const result = objectGetExecutor(createContext(
        { object: { a: 1 }, path: 'b.c' },
        { default: 'fallback' }
      ))
      expect(result.get('value')).toBe('fallback')
      expect(result.get('found')).toBe(0)
    })

    it('uses defaultPath control', () => {
      const result = objectGetExecutor(createContext(
        { object: { a: 'value' } },
        { defaultPath: 'a' }
      ))
      expect(result.get('value')).toBe('value')
    })
  })

  // ============================================================================
  // Object Set
  // ============================================================================
  describe('objectSetExecutor', () => {
    it('sets property by path', () => {
      const result = objectSetExecutor(createContext(
        { object: { a: 1 }, path: 'b', value: 2 }
      ))
      expect(result.get('result')).toEqual({ a: 1, b: 2 })
    })

    it('sets nested property', () => {
      const result = objectSetExecutor(createContext(
        { object: { a: {} }, path: 'a.b', value: 'nested' }
      ))
      expect(result.get('result')).toEqual({ a: { b: 'nested' } })
    })

    it('creates nested structure', () => {
      const result = objectSetExecutor(createContext(
        { object: {}, path: 'a.b.c', value: 'deep' }
      ))
      expect(result.get('result')).toEqual({ a: { b: { c: 'deep' } } })
    })
  })

  // ============================================================================
  // Object Keys
  // ============================================================================
  describe('objectKeysExecutor', () => {
    it('returns keys', () => {
      const result = objectKeysExecutor(createContext({ object: { a: 1, b: 2, c: 3 } }))
      expect(result.get('keys')).toEqual(['a', 'b', 'c'])
      expect(result.get('count')).toBe(3)
    })

    it('returns empty for non-object', () => {
      const result = objectKeysExecutor(createContext({ object: 'not an object' }))
      expect(result.get('keys')).toEqual([])
      expect(result.get('count')).toBe(0)
    })
  })

  // ============================================================================
  // Object Values
  // ============================================================================
  describe('objectValuesExecutor', () => {
    it('returns values', () => {
      const result = objectValuesExecutor(createContext({ object: { a: 1, b: 2, c: 3 } }))
      expect(result.get('values')).toEqual([1, 2, 3])
      expect(result.get('count')).toBe(3)
    })
  })

  // ============================================================================
  // Object Has
  // ============================================================================
  describe('objectHasExecutor', () => {
    it('returns true for existing path', () => {
      const result = objectHasExecutor(createContext({ object: { a: { b: 1 } }, path: 'a.b' }))
      expect(result.get('result')).toBe(1)
    })

    it('returns false for missing path', () => {
      const result = objectHasExecutor(createContext({ object: { a: 1 }, path: 'b' }))
      expect(result.get('result')).toBe(0)
    })
  })

  // ============================================================================
  // Object Merge
  // ============================================================================
  describe('objectMergeExecutor', () => {
    it('merges objects', () => {
      const result = objectMergeExecutor(createContext({ a: { x: 1 }, b: { y: 2 } }))
      expect(result.get('result')).toEqual({ x: 1, y: 2 })
    })

    it('b overwrites a', () => {
      const result = objectMergeExecutor(createContext({ a: { x: 1 }, b: { x: 2 } }))
      expect(result.get('result')).toEqual({ x: 2 })
    })
  })

  // ============================================================================
  // Object Create
  // ============================================================================
  describe('objectCreateExecutor', () => {
    it('creates object from pairs', () => {
      const result = objectCreateExecutor(createContext({
        key1: 'name', value1: 'John',
        key2: 'age', value2: 30
      }))
      expect(result.get('result')).toEqual({ name: 'John', age: 30 })
    })

    it('ignores empty keys', () => {
      const result = objectCreateExecutor(createContext({
        key1: 'name', value1: 'John',
        key2: '', value2: 'ignored'
      }))
      expect(result.get('result')).toEqual({ name: 'John' })
    })
  })

  // ============================================================================
  // Object Entries
  // ============================================================================
  describe('objectEntriesExecutor', () => {
    it('returns entries', () => {
      const result = objectEntriesExecutor(createContext({ object: { a: 1, b: 2 } }))
      expect(result.get('entries')).toEqual([['a', 1], ['b', 2]])
      expect(result.get('count')).toBe(2)
    })
  })

  // ============================================================================
  // To String
  // ============================================================================
  describe('toStringExecutor', () => {
    it('converts number to string', () => {
      const result = toStringExecutor(createContext({ value: 42 }))
      expect(result.get('result')).toBe('42')
    })

    it('formats with fixed precision', () => {
      const result = toStringExecutor(createContext({ value: 3.14159 }, { format: 'fixed', precision: 2 }))
      expect(result.get('result')).toBe('3.14')
    })

    it('converts to JSON', () => {
      const result = toStringExecutor(createContext({ value: { a: 1 } }, { format: 'json' }))
      expect(result.get('result')).toContain('"a": 1')
    })

    it('handles null', () => {
      const result = toStringExecutor(createContext({ value: null }))
      expect(result.get('result')).toBe('null')
    })
  })

  // ============================================================================
  // To Number
  // ============================================================================
  describe('toNumberExecutor', () => {
    it('converts string to number', () => {
      const result = toNumberExecutor(createContext({ value: '42' }))
      expect(result.get('result')).toBe(42)
      expect(result.get('valid')).toBe(1)
    })

    it('returns default for invalid', () => {
      const result = toNumberExecutor(createContext({ value: 'not a number' }, { default: -1 }))
      expect(result.get('result')).toBe(-1)
      expect(result.get('valid')).toBe(0)
    })

    it('converts boolean', () => {
      expect(toNumberExecutor(createContext({ value: true })).get('result')).toBe(1)
      expect(toNumberExecutor(createContext({ value: false })).get('result')).toBe(0)
    })
  })

  // ============================================================================
  // To Boolean
  // ============================================================================
  describe('toBooleanExecutor', () => {
    describe('truthy mode', () => {
      it('converts truthy values', () => {
        expect(toBooleanExecutor(createContext({ value: 'hello' }, { mode: 'truthy' })).get('result')).toBe(1)
        expect(toBooleanExecutor(createContext({ value: 1 }, { mode: 'truthy' })).get('result')).toBe(1)
        expect(toBooleanExecutor(createContext({ value: [] }, { mode: 'truthy' })).get('result')).toBe(1)
      })

      it('converts falsy values', () => {
        expect(toBooleanExecutor(createContext({ value: '' }, { mode: 'truthy' })).get('result')).toBe(0)
        expect(toBooleanExecutor(createContext({ value: 0 }, { mode: 'truthy' })).get('result')).toBe(0)
        expect(toBooleanExecutor(createContext({ value: null }, { mode: 'truthy' })).get('result')).toBe(0)
      })
    })

    describe('strict mode', () => {
      it('only accepts boolean-like values', () => {
        expect(toBooleanExecutor(createContext({ value: true }, { mode: 'strict' })).get('result')).toBe(1)
        expect(toBooleanExecutor(createContext({ value: 'true' }, { mode: 'strict' })).get('result')).toBe(1)
        expect(toBooleanExecutor(createContext({ value: 1 }, { mode: 'strict' })).get('result')).toBe(1)
        expect(toBooleanExecutor(createContext({ value: false }, { mode: 'strict' })).get('result')).toBe(0)
        expect(toBooleanExecutor(createContext({ value: 'false' }, { mode: 'strict' })).get('result')).toBe(0)
        expect(toBooleanExecutor(createContext({ value: 0 }, { mode: 'strict' })).get('result')).toBe(0)
      })

      it('returns false for non-boolean values', () => {
        expect(toBooleanExecutor(createContext({ value: 'hello' }, { mode: 'strict' })).get('result')).toBe(0)
        expect(toBooleanExecutor(createContext({ value: 42 }, { mode: 'strict' })).get('result')).toBe(0)
      })
    })
  })

  // ============================================================================
  // Parse Int
  // ============================================================================
  describe('parseIntExecutor', () => {
    it('parses decimal', () => {
      const result = parseIntExecutor(createContext({ value: '42' }, { radix: 10 }))
      expect(result.get('result')).toBe(42)
      expect(result.get('valid')).toBe(1)
    })

    it('parses hex', () => {
      const result = parseIntExecutor(createContext({ value: 'ff' }, { radix: 16 }))
      expect(result.get('result')).toBe(255)
    })

    it('parses binary', () => {
      const result = parseIntExecutor(createContext({ value: '1010' }, { radix: 2 }))
      expect(result.get('result')).toBe(10)
    })

    it('returns default for invalid', () => {
      const result = parseIntExecutor(createContext({ value: 'abc' }, { radix: 10, default: -1 }))
      expect(result.get('result')).toBe(-1)
      expect(result.get('valid')).toBe(0)
    })
  })

  // ============================================================================
  // Parse Float
  // ============================================================================
  describe('parseFloatExecutor', () => {
    it('parses float', () => {
      const result = parseFloatExecutor(createContext({ value: '3.14' }))
      expect(result.get('result')).toBeCloseTo(3.14)
      expect(result.get('valid')).toBe(1)
    })

    it('returns default for invalid', () => {
      const result = parseFloatExecutor(createContext({ value: 'not a number' }, { default: 0 }))
      expect(result.get('result')).toBe(0)
      expect(result.get('valid')).toBe(0)
    })
  })

  // ============================================================================
  // To Array
  // ============================================================================
  describe('toArrayExecutor', () => {
    describe('wrap mode', () => {
      it('wraps single value', () => {
        const result = toArrayExecutor(createContext({ value: 'hello' }, { mode: 'wrap' }))
        expect(result.get('result')).toEqual(['hello'])
      })

      it('returns array as is', () => {
        const result = toArrayExecutor(createContext({ value: [1, 2, 3] }, { mode: 'wrap' }))
        expect(result.get('result')).toEqual([1, 2, 3])
      })
    })

    describe('split mode', () => {
      it('splits string', () => {
        const result = toArrayExecutor(createContext({ value: 'a,b,c' }, { mode: 'split', separator: ',' }))
        expect(result.get('result')).toEqual(['a', 'b', 'c'])
      })
    })
  })

  // ============================================================================
  // Format Number
  // ============================================================================
  describe('formatNumberExecutor', () => {
    it('formats decimal', () => {
      const result = formatNumberExecutor(createContext({ value: 1234.5 }, { style: 'decimal', decimals: 2 }))
      expect(result.get('result')).toBe('1,234.50')
    })

    it('formats percent', () => {
      const result = formatNumberExecutor(createContext({ value: 0.75 }, { style: 'percent', decimals: 0 }))
      expect(result.get('result')).toBe('75%')
    })

    it('formats currency', () => {
      const result = formatNumberExecutor(createContext({ value: 99.99 }, { style: 'currency', currency: 'USD', decimals: 2 }))
      expect(result.get('result')).toContain('99.99')
    })
  })
})
