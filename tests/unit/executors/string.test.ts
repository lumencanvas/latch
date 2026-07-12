/**
 * String Executor Tests
 *
 * Comprehensive tests for string manipulation node executors
 */

import { describe, it, expect, beforeEach } from 'vitest'
// These string nodes are co-located (Phase 6); their executors ship on the
// node.ts default export, not a legacy executor barrel. Alias so call sites are unchanged.
import stringConcatNode from '@/registry/string/string-concat/node'
import stringSplitNode from '@/registry/string/string-split/node'
import stringReplaceNode from '@/registry/string/string-replace/node'
import stringSliceNode from '@/registry/string/string-slice/node'
import stringCaseNode from '@/registry/string/string-case/node'
import stringLengthNode from '@/registry/string/string-length/node'
import stringContainsNode from '@/registry/string/string-contains/node'
import stringStartsEndsNode from '@/registry/string/string-starts-ends/node'
import stringTrimNode from '@/registry/string/string-trim/node'
import stringPadNode from '@/registry/string/string-pad/node'
import stringTemplateNode from '@/registry/string/string-template/node'
import stringMatchNode from '@/registry/string/string-match/node'

const stringConcatExecutor = stringConcatNode.executor
const stringSplitExecutor = stringSplitNode.executor
const stringReplaceExecutor = stringReplaceNode.executor
const stringSliceExecutor = stringSliceNode.executor
const stringCaseExecutor = stringCaseNode.executor
const stringLengthExecutor = stringLengthNode.executor
const stringContainsExecutor = stringContainsNode.executor
const stringStartsEndsExecutor = stringStartsEndsNode.executor
const stringTrimExecutor = stringTrimNode.executor
const stringPadExecutor = stringPadNode.executor
const stringTemplateExecutor = stringTemplateNode.executor
const stringMatchExecutor = stringMatchNode.executor
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

describe('String Executors', () => {
  // ============================================================================
  // String Concat
  // ============================================================================
  describe('stringConcatExecutor', () => {
    describe('basic concatenation', () => {
      it('concatenates two strings without separator', () => {
        const ctx = createContext({ a: 'Hello', b: 'World' })
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('HelloWorld')
      })

      it('concatenates multiple strings', () => {
        const ctx = createContext({ a: 'a', b: 'b', c: 'c', d: 'd' })
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('abcd')
      })

      it('uses separator between parts', () => {
        const ctx = createContext(
          { a: 'one', b: 'two', c: 'three' },
          { separator: ', ' }
        )
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('one, two, three')
      })

      it('handles single string input', () => {
        const ctx = createContext({ a: 'only' })
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('only')
      })
    })

    describe('empty string handling', () => {
      it('filters out empty strings by default', () => {
        const ctx = createContext(
          { a: 'hello', b: '', c: 'world' },
          { separator: '-' }
        )
        const result = stringConcatExecutor(ctx)
        // NOTE: Current behavior filters empty strings
        expect(result.get('result')).toBe('hello-world')
      })

      it('returns empty string when all inputs are empty', () => {
        const ctx = createContext({ a: '', b: '', c: '', d: '' })
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('')
      })

      it('returns empty string when no inputs provided', () => {
        const ctx = createContext({})
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('')
      })
    })

    describe('edge cases', () => {
      it('handles null/undefined inputs gracefully', () => {
        const ctx = createContext({ a: null, b: undefined, c: 'valid' })
        const result = stringConcatExecutor(ctx)
        // null and undefined should be treated as empty string
        expect(result.get('result')).toBe('valid')
      })

      it('handles numbers as inputs (type coercion)', () => {
        const ctx = createContext({ a: 123, b: 456 })
        const result = stringConcatExecutor(ctx)
        // Numbers should be converted to strings or treated as empty
        expect(typeof result.get('result')).toBe('string')
      })

      it('handles special characters', () => {
        const ctx = createContext(
          { a: 'hello\nworld', b: '\ttab' },
          { separator: '|' }
        )
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('hello\nworld|\ttab')
      })

      it('handles unicode characters', () => {
        const ctx = createContext(
          { a: '你好', b: '🌍', c: 'مرحبا' },
          { separator: ' ' }
        )
        const result = stringConcatExecutor(ctx)
        expect(result.get('result')).toBe('你好 🌍 مرحبا')
      })
    })
  })

  // ============================================================================
  // String Split
  // ============================================================================
  describe('stringSplitExecutor', () => {
    describe('basic splitting', () => {
      it('splits string by comma', () => {
        const ctx = createContext({ input: 'a,b,c' }, { separator: ',' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['a', 'b', 'c'])
        expect(result.get('first')).toBe('a')
        expect(result.get('count')).toBe(3)
      })

      it('splits by multi-character separator', () => {
        const ctx = createContext({ input: 'one::two::three' }, { separator: '::' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['one', 'two', 'three'])
      })

      it('uses default comma separator', () => {
        const ctx = createContext({ input: 'x,y,z' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['x', 'y', 'z'])
      })
    })

    describe('limit parameter', () => {
      it('respects limit parameter', () => {
        const ctx = createContext(
          { input: 'a,b,c,d,e' },
          { separator: ',', limit: 3 }
        )
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['a', 'b', 'c'])
        expect(result.get('count')).toBe(3)
      })

      it('returns all parts when limit is 0', () => {
        const ctx = createContext(
          { input: 'a,b,c,d,e' },
          { separator: ',', limit: 0 }
        )
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['a', 'b', 'c', 'd', 'e'])
      })

      it('handles limit greater than parts count', () => {
        const ctx = createContext(
          { input: 'a,b' },
          { separator: ',', limit: 10 }
        )
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['a', 'b'])
      })
    })

    describe('edge cases', () => {
      it('handles empty input', () => {
        const ctx = createContext({ input: '' }, { separator: ',' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual([])
        expect(result.get('first')).toBe('')
        expect(result.get('count')).toBe(0)
      })

      it('handles missing separator in string', () => {
        const ctx = createContext({ input: 'no separator here' }, { separator: ',' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['no separator here'])
        expect(result.get('count')).toBe(1)
      })

      it('handles empty separator (returns whole string)', () => {
        const ctx = createContext({ input: 'abc' }, { separator: '' })
        const result = stringSplitExecutor(ctx)
        // FIXED: Empty separator now returns whole string as single element
        expect(result.get('parts')).toEqual(['abc'])
        expect(result.get('first')).toBe('abc')
        expect(result.get('count')).toBe(1)
      })

      it('handles separator at start and end', () => {
        const ctx = createContext({ input: ',a,b,c,' }, { separator: ',' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['', 'a', 'b', 'c', ''])
        expect(result.get('first')).toBe('')
        expect(result.get('count')).toBe(5)
      })

      it('handles consecutive separators', () => {
        const ctx = createContext({ input: 'a,,b,,c' }, { separator: ',' })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual(['a', '', 'b', '', 'c'])
      })

      it('handles null input', () => {
        const ctx = createContext({ input: null })
        const result = stringSplitExecutor(ctx)
        expect(result.get('parts')).toEqual([])
        expect(result.get('count')).toBe(0)
      })
    })
  })

  // ============================================================================
  // String Replace
  // ============================================================================
  describe('stringReplaceExecutor', () => {
    describe('basic replacement', () => {
      it('replaces first occurrence by default', () => {
        const ctx = createContext(
          { input: 'hello hello' },
          { search: 'hello', replace: 'hi', replaceAll: false }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('hi hello')
      })

      it('replaces all occurrences with replaceAll', () => {
        const ctx = createContext(
          { input: 'hello hello hello' },
          { search: 'hello', replace: 'hi', replaceAll: true }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('hi hi hi')
      })

      it('handles empty replacement', () => {
        const ctx = createContext(
          { input: 'remove this word' },
          { search: 'this ', replace: '', replaceAll: true }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('remove word')
      })
    })

    describe('regex mode', () => {
      it('supports basic regex patterns', () => {
        const ctx = createContext(
          { input: 'abc123def456' },
          { search: '\\d+', replace: 'NUM', useRegex: true, replaceAll: true }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('abcNUMdefNUM')
      })

      it('handles regex capture groups', () => {
        const ctx = createContext(
          { input: 'John Smith' },
          { search: '(\\w+) (\\w+)', replace: '$2, $1', useRegex: true }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('Smith, John')
      })

      it('handles invalid regex gracefully', () => {
        const ctx = createContext(
          { input: 'test string' },
          { search: '[invalid', replace: 'x', useRegex: true }
        )
        const result = stringReplaceExecutor(ctx)
        // Should return original string on invalid regex
        expect(result.get('result')).toBe('test string')
        expect(result.get('_error')).toBe('Invalid regex pattern')
      })

      it('respects replaceAll flag in regex mode', () => {
        const ctx = createContext(
          { input: 'a1b2c3' },
          { search: '\\d', replace: 'X', useRegex: true, replaceAll: false }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('aXb2c3')
      })
    })

    describe('input priority', () => {
      it('uses search input over control', () => {
        const ctx = createContext(
          { input: 'hello world', search: 'world' },
          { search: 'hello', replace: 'universe' }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('hello universe')
      })

      it('uses replace input over control', () => {
        const ctx = createContext(
          { input: 'hello world', replace: 'REPLACED' },
          { search: 'world', replace: 'ignored' }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('hello REPLACED')
      })

      it('uses empty input when explicitly provided', () => {
        const ctx = createContext(
          { input: 'test', search: '' },
          { search: 'test', replace: 'passed' }
        )
        const result = stringReplaceExecutor(ctx)
        // FIXED: Empty string input is now respected (doesn't fall back to control)
        // Empty search means no replacement
        expect(result.get('result')).toBe('test')
      })
    })

    describe('edge cases', () => {
      it('handles empty input', () => {
        const ctx = createContext(
          { input: '' },
          { search: 'test', replace: 'new' }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('')
      })

      it('handles empty search', () => {
        const ctx = createContext(
          { input: 'unchanged' },
          { search: '', replace: 'x' }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('unchanged')
      })

      it('handles no match found', () => {
        const ctx = createContext(
          { input: 'hello world' },
          { search: 'foo', replace: 'bar' }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('hello world')
      })

      it('handles special regex characters in non-regex mode', () => {
        const ctx = createContext(
          { input: 'price is $10.00' },
          { search: '$10.00', replace: '$20.00', useRegex: false, replaceAll: true }
        )
        const result = stringReplaceExecutor(ctx)
        expect(result.get('result')).toBe('price is $20.00')
      })
    })
  })

  // ============================================================================
  // String Slice
  // ============================================================================
  describe('stringSliceExecutor', () => {
    describe('basic slicing', () => {
      it('slices from start to end', () => {
        const ctx = createContext({ input: 'hello world' }, { start: 0, end: 5 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('hello')
        expect(result.get('length')).toBe(5)
      })

      it('slices from middle', () => {
        const ctx = createContext({ input: 'hello world' }, { start: 6, end: 11 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('world')
      })

      it('slices to end when end is -1', () => {
        const ctx = createContext({ input: 'hello world' }, { start: 6, end: -1 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('world')
      })
    })

    describe('negative indices', () => {
      it('handles negative start', () => {
        const ctx = createContext({ input: 'hello world' }, { start: -5, end: -1 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('world')
      })

      it('handles start beyond string length', () => {
        const ctx = createContext({ input: 'short' }, { start: 100, end: -1 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('')
      })
    })

    describe('input override', () => {
      it('uses input start over control', () => {
        const ctx = createContext(
          { input: 'hello world', start: 6 },
          { start: 0, end: -1 }
        )
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('world')
      })

      it('uses input end over control', () => {
        const ctx = createContext(
          { input: 'hello world', end: 5 },
          { start: 0, end: -1 }
        )
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('hello')
      })
    })

    describe('edge cases', () => {
      it('handles empty input', () => {
        const ctx = createContext({ input: '' }, { start: 0, end: 5 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('')
        expect(result.get('length')).toBe(0)
      })

      it('handles null input', () => {
        const ctx = createContext({ input: null })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('')
        expect(result.get('length')).toBe(0)
      })

      it('handles end before start', () => {
        const ctx = createContext({ input: 'hello' }, { start: 3, end: 1 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('')
      })

      it('handles unicode characters correctly', () => {
        const ctx = createContext({ input: '你好世界' }, { start: 0, end: 2 })
        const result = stringSliceExecutor(ctx)
        expect(result.get('result')).toBe('你好')
        expect(result.get('length')).toBe(2)
      })
    })
  })

  // ============================================================================
  // String Case
  // ============================================================================
  describe('stringCaseExecutor', () => {
    describe('uppercase', () => {
      it('converts to uppercase', () => {
        const ctx = createContext({ input: 'hello world' }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('HELLO WORLD')
      })

      it('handles already uppercase', () => {
        const ctx = createContext({ input: 'HELLO' }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('HELLO')
      })
    })

    describe('lowercase', () => {
      it('converts to lowercase', () => {
        const ctx = createContext({ input: 'HELLO WORLD' }, { mode: 'lower' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('hello world')
      })
    })

    describe('title case', () => {
      it('converts to title case', () => {
        const ctx = createContext({ input: 'hello world' }, { mode: 'Title' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('Hello World')
      })

      it('handles mixed case input', () => {
        const ctx = createContext({ input: 'hELLO wORLD' }, { mode: 'Title' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('HELLO WORLD')
      })
    })

    describe('camelCase', () => {
      it('converts to camelCase', () => {
        const ctx = createContext({ input: 'hello world' }, { mode: 'camelCase' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('helloWorld')
      })

      it('handles special characters', () => {
        const ctx = createContext({ input: 'hello-world test' }, { mode: 'camelCase' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('helloWorldTest')
      })

      it('handles multiple spaces', () => {
        const ctx = createContext({ input: 'hello   world' }, { mode: 'camelCase' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('helloWorld')
      })
    })

    describe('snake_case', () => {
      it('converts to snake_case', () => {
        const ctx = createContext({ input: 'Hello World' }, { mode: 'snake_case' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('hello_world')
      })

      it('handles camelCase input', () => {
        const ctx = createContext({ input: 'helloWorld' }, { mode: 'snake_case' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('hello_world')
      })

      it('handles consecutive capitals', () => {
        const ctx = createContext({ input: 'XMLParser' }, { mode: 'snake_case' })
        const result = stringCaseExecutor(ctx)
        // Each capital becomes _X
        expect(result.get('result')).toContain('_')
      })
    })

    describe('kebab-case', () => {
      it('converts to kebab-case', () => {
        const ctx = createContext({ input: 'Hello World' }, { mode: 'kebab-case' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('hello-world')
      })

      it('handles camelCase input', () => {
        const ctx = createContext({ input: 'helloWorld' }, { mode: 'kebab-case' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('hello-world')
      })
    })

    describe('edge cases', () => {
      it('handles empty string', () => {
        const ctx = createContext({ input: '' }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('')
      })

      it('handles single character', () => {
        const ctx = createContext({ input: 'a' }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('A')
      })

      it('handles unknown mode by returning input unchanged', () => {
        const ctx = createContext({ input: 'test' }, { mode: 'unknown' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('test')
      })

      it('handles numbers in string', () => {
        const ctx = createContext({ input: 'hello123world' }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('HELLO123WORLD')
      })

      it('handles null input', () => {
        const ctx = createContext({ input: null }, { mode: 'UPPER' })
        const result = stringCaseExecutor(ctx)
        expect(result.get('result')).toBe('')
      })
    })
  })

  // ============================================================================
  // String Length
  // ============================================================================
  describe('stringLengthExecutor', () => {
    it('returns length of string', () => {
      const ctx = createContext({ input: 'hello' })
      const result = stringLengthExecutor(ctx)
      expect(result.get('length')).toBe(5)
      expect(result.get('isEmpty')).toBe(0)
    })

    it('returns 0 for empty string', () => {
      const ctx = createContext({ input: '' })
      const result = stringLengthExecutor(ctx)
      expect(result.get('length')).toBe(0)
      expect(result.get('isEmpty')).toBe(1)
    })

    it('handles null input', () => {
      const ctx = createContext({ input: null })
      const result = stringLengthExecutor(ctx)
      expect(result.get('length')).toBe(0)
      expect(result.get('isEmpty')).toBe(1)
    })

    it('handles unicode correctly', () => {
      const ctx = createContext({ input: '你好🌍' })
      const result = stringLengthExecutor(ctx)
      expect(result.get('length')).toBe(4) // 2 chinese chars + 1 emoji (2 code units)
    })
  })

  // ============================================================================
  // String Contains
  // ============================================================================
  describe('stringContainsExecutor', () => {
    it('finds substring', () => {
      const ctx = createContext({ input: 'hello world', search: 'world' })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('index')).toBe(6)
    })

    it('returns 0 when not found', () => {
      const ctx = createContext({ input: 'hello world', search: 'foo' })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(0)
      expect(result.get('index')).toBe(-1)
    })

    it('is case sensitive by default', () => {
      const ctx = createContext({ input: 'Hello World', search: 'hello' }, { caseSensitive: true })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(0)
    })

    it('can be case insensitive', () => {
      const ctx = createContext({ input: 'Hello World', search: 'hello' }, { caseSensitive: false })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(1)
      expect(result.get('index')).toBe(0)
    })

    it('handles empty search', () => {
      const ctx = createContext({ input: 'hello', search: '' })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(0)
    })

    it('handles empty input', () => {
      const ctx = createContext({ input: '', search: 'test' })
      const result = stringContainsExecutor(ctx)
      expect(result.get('result')).toBe(0)
    })
  })

  // ============================================================================
  // String Starts/Ends With
  // ============================================================================
  describe('stringStartsEndsExecutor', () => {
    it('detects starts with', () => {
      const ctx = createContext({ input: 'hello world', search: 'hello' })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(1)
      expect(result.get('endsWith')).toBe(0)
    })

    it('detects ends with', () => {
      const ctx = createContext({ input: 'hello world', search: 'world' })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(0)
      expect(result.get('endsWith')).toBe(1)
    })

    it('detects both when same', () => {
      const ctx = createContext({ input: 'hello', search: 'hello' })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(1)
      expect(result.get('endsWith')).toBe(1)
    })

    it('is case sensitive by default', () => {
      const ctx = createContext({ input: 'Hello World', search: 'hello' }, { caseSensitive: true })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(0)
    })

    it('can be case insensitive', () => {
      const ctx = createContext({ input: 'Hello World', search: 'hello' }, { caseSensitive: false })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(1)
    })

    it('handles empty input', () => {
      const ctx = createContext({ input: '', search: 'test' })
      const result = stringStartsEndsExecutor(ctx)
      expect(result.get('startsWith')).toBe(0)
      expect(result.get('endsWith')).toBe(0)
    })
  })

  // ============================================================================
  // String Trim
  // ============================================================================
  describe('stringTrimExecutor', () => {
    it('trims both ends by default', () => {
      const ctx = createContext({ input: '  hello  ' }, { mode: 'both' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('hello')
    })

    it('trims start only', () => {
      const ctx = createContext({ input: '  hello  ' }, { mode: 'start' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('hello  ')
    })

    it('trims end only', () => {
      const ctx = createContext({ input: '  hello  ' }, { mode: 'end' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('  hello')
    })

    it('handles tabs and newlines', () => {
      const ctx = createContext({ input: '\t\nhello\n\t' }, { mode: 'both' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('hello')
    })

    it('handles already trimmed string', () => {
      const ctx = createContext({ input: 'hello' }, { mode: 'both' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('hello')
    })

    it('handles empty string', () => {
      const ctx = createContext({ input: '' })
      const result = stringTrimExecutor(ctx)
      expect(result.get('result')).toBe('')
    })
  })

  // ============================================================================
  // String Pad
  // ============================================================================
  describe('stringPadExecutor', () => {
    it('pads start by default', () => {
      const ctx = createContext({ input: '5' }, { length: 3, char: '0', mode: 'start' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('005')
    })

    it('pads end', () => {
      const ctx = createContext({ input: 'hi' }, { length: 5, char: '-', mode: 'end' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('hi---')
    })

    it('uses space as default char', () => {
      const ctx = createContext({ input: 'x' }, { length: 3, mode: 'start' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('  x')
    })

    it('handles string already at target length', () => {
      const ctx = createContext({ input: 'hello' }, { length: 5, mode: 'start' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('hello')
    })

    it('handles string longer than target', () => {
      const ctx = createContext({ input: 'hello world' }, { length: 5, mode: 'start' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('hello world')
    })

    it('handles empty input', () => {
      const ctx = createContext({ input: '' }, { length: 3, char: 'x', mode: 'start' })
      const result = stringPadExecutor(ctx)
      expect(result.get('result')).toBe('xxx')
    })
  })

  // ============================================================================
  // String Template
  // ============================================================================
  describe('stringTemplateExecutor', () => {
    it('replaces placeholders', () => {
      const ctx = createContext(
        { a: 'World', b: 42 },
        { template: 'Hello {a}! The answer is {b}.' }
      )
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe('Hello World! The answer is 42.')
    })

    it('replaces all occurrences of same placeholder', () => {
      const ctx = createContext(
        { a: 'x' },
        { template: '{a} and {a} and {a}' }
      )
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe('x and x and x')
    })

    it('handles missing placeholders', () => {
      const ctx = createContext(
        { a: 'value' },
        { template: '{a} {b} {c} {d}' }
      )
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe('value   ')
    })

    it('handles null values', () => {
      const ctx = createContext(
        { a: null, b: undefined },
        { template: '{a} and {b}' }
      )
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe(' and ')
    })

    it('handles empty template', () => {
      const ctx = createContext({ a: 'test' }, { template: '' })
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe('')
    })

    it('handles template without placeholders', () => {
      const ctx = createContext({ a: 'test' }, { template: 'no placeholders here' })
      const result = stringTemplateExecutor(ctx)
      expect(result.get('result')).toBe('no placeholders here')
    })
  })

  // ============================================================================
  // String Match (Regex)
  // ============================================================================
  describe('stringMatchExecutor', () => {
    it('matches simple pattern', () => {
      const ctx = createContext({ input: 'hello123world' }, { pattern: '\\d+', flags: '' })
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(1)
      expect(result.get('fullMatch')).toBe('123')
    })

    it('returns capture groups', () => {
      const ctx = createContext(
        { input: 'John Smith' },
        { pattern: '(\\w+) (\\w+)', flags: '' }
      )
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(1)
      expect(result.get('groups')).toEqual(['John', 'Smith'])
      expect(result.get('fullMatch')).toBe('John Smith')
    })

    it('returns no match', () => {
      const ctx = createContext({ input: 'hello' }, { pattern: '\\d+', flags: '' })
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(0)
      expect(result.get('groups')).toEqual([])
      expect(result.get('fullMatch')).toBe('')
    })

    it('handles flags', () => {
      const ctx = createContext({ input: 'HELLO' }, { pattern: 'hello', flags: 'i' })
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(1)
    })

    it('handles invalid regex', () => {
      const ctx = createContext({ input: 'test' }, { pattern: '[invalid', flags: '' })
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(0)
      expect(result.get('_error')).toBe('Invalid regex pattern')
    })

    it('handles empty input', () => {
      const ctx = createContext({ input: '' }, { pattern: '.*', flags: '' })
      const result = stringMatchExecutor(ctx)
      expect(result.get('match')).toBe(1) // .* matches empty string
    })
  })
})
