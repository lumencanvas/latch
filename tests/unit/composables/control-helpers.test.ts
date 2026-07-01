import { describe, it, expect } from 'vitest'
import { clampControlNumber, isDeviceOptions, evaluateWhen } from '@/composables/useControlHelpers'

/**
 * The pure control-rendering helpers shared by BaseNode + PropertiesPanel (Phase 3 dedup).
 * The clamp mirrors the behavior the BaseNode component test already guards end-to-end.
 */
describe('clampControlNumber', () => {
  it('parses and passes through an in-range value', () => {
    expect(clampControlNumber('5', { min: 0, max: 10, fallback: 0 })).toBe(5)
  })

  it('clamps to min and max', () => {
    expect(clampControlNumber('-3', { min: 0, max: 10, fallback: 0 })).toBe(0)
    expect(clampControlNumber('99', { min: 0, max: 10, fallback: 0 })).toBe(10)
  })

  it('uses the fallback when the raw value is not finite', () => {
    expect(clampControlNumber('abc', { min: 0, max: 10, fallback: 7 })).toBe(7)
    expect(clampControlNumber('', { fallback: 3 })).toBe(3)
  })

  it('leaves the value unbounded when min/max are absent or non-numeric', () => {
    expect(clampControlNumber('1000', { fallback: 0 })).toBe(1000)
    expect(clampControlNumber('1000', { min: undefined, max: 'x', fallback: 0 })).toBe(1000)
  })
})

describe('isDeviceOptions', () => {
  it('is true for {value,label} objects, false for string[] or empty', () => {
    expect(isDeviceOptions([{ value: 'a', label: 'A' }])).toBe(true)
    expect(isDeviceOptions(['a', 'b'])).toBe(false)
    expect(isDeviceOptions([])).toBe(false)
  })
})

/**
 * The unified conditional-visibility evaluator (Phase 3). It is the single semantics the three
 * legacy schemas map onto; these cases pin each mapping so a future refactor can't drift them.
 */
describe('evaluateWhen', () => {
  it('an absent schema is always visible', () => {
    expect(evaluateWhen(undefined, {})).toBe(true)
    expect(evaluateWhen({}, { a: 1 })).toBe(true)
  })

  it('single-key equality (subsumes visibleWhen / showIf value)', () => {
    expect(evaluateWhen({ mode: 'binary' }, { mode: 'binary' })).toBe(true)
    expect(evaluateWhen({ mode: 'binary' }, { mode: 'adaptive' })).toBe(false)
    // a missing sibling value is undefined !== the target → hidden
    expect(evaluateWhen({ mode: 'binary' }, {})).toBe(false)
  })

  it('multi-key is AND (subsumes props.showWhen)', () => {
    expect(evaluateWhen({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    expect(evaluateWhen({ a: 1, b: 2 }, { a: 1, b: 9 })).toBe(false)
  })

  it('the { in } operator tests membership (subsumes showIf values)', () => {
    expect(evaluateWhen({ role: { in: ['admin', 'root'] } }, { role: 'root' })).toBe(true)
    expect(evaluateWhen({ role: { in: ['admin', 'root'] } }, { role: 'guest' })).toBe(false)
  })

  it('uses strict equality (no coercion) and matches empty-string targets', () => {
    expect(evaluateWhen({ templateId: '' }, { templateId: '' })).toBe(true)
    expect(evaluateWhen({ n: 1 }, { n: '1' })).toBe(false)
  })
})
