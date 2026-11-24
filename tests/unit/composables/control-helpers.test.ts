import { describe, it, expect } from 'vitest'
import { clampControlNumber, isDeviceOptions, evaluateWhen, coerceSelectValue } from '@/composables/useControlHelpers'

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
 * A native <select> emits a string. `coerceSelectValue` restores the matching option's TYPE so
 * a numeric-option select (MQTT QoS `[0,1,2]`, Serial baud `[9600,…]`) stores a number after an
 * edit instead of silently flipping to a string — the round-trip bug the 2026-07-23 audit found.
 */
describe('coerceSelectValue', () => {
  it('restores a numeric option value from the emitted string', () => {
    // number[] options reach the DOM as numbers cast into the string union at runtime.
    const opts = [0, 1, 2] as unknown as string[]
    expect(coerceSelectValue('1', opts)).toBe(1)
    expect(coerceSelectValue('0', opts)).toBe(0)
    expect(typeof coerceSelectValue('2', opts)).toBe('number')
  })

  it('restores a numeric {value,label} option', () => {
    const opts = [{ value: 9600, label: '9600' }, { value: 115200, label: '115200' }] as unknown as never
    expect(coerceSelectValue('115200', opts)).toBe(115200)
  })

  it('leaves string options as strings', () => {
    expect(coerceSelectValue('va', ['va', 'fm'])).toBe('va')
  })

  it('returns the raw value when no option matches (device / free values)', () => {
    expect(coerceSelectValue('unknown-id', ['a', 'b'])).toBe('unknown-id')
    expect(coerceSelectValue('dev-123', [{ value: 'dev-123', label: 'Mic' }])).toBe('dev-123')
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

  it('the { ne } operator tests inequality', () => {
    expect(evaluateWhen({ mode: { ne: 'off' } }, { mode: 'on' })).toBe(true)
    expect(evaluateWhen({ mode: { ne: 'off' } }, { mode: 'off' })).toBe(false)
    // a missing sibling (undefined) is `ne` any concrete value → visible
    expect(evaluateWhen({ mode: { ne: 'off' } }, {})).toBe(true)
  })

  it('the { gt } / { lt } operators test numeric ordering (false for non-numbers)', () => {
    expect(evaluateWhen({ x: { gt: 5 } }, { x: 10 })).toBe(true)
    expect(evaluateWhen({ x: { gt: 5 } }, { x: 5 })).toBe(false)
    expect(evaluateWhen({ x: { lt: 5 } }, { x: 2 })).toBe(true)
    expect(evaluateWhen({ x: { lt: 5 } }, { x: 5 })).toBe(false)
    // non-numeric actual never satisfies an ordering operator
    expect(evaluateWhen({ x: { gt: 5 } }, { x: 'big' })).toBe(false)
    expect(evaluateWhen({ x: { lt: 5 } }, {})).toBe(false)
  })

  it('operators combine with plain keys under AND', () => {
    expect(evaluateWhen({ mode: 'adaptive', level: { gt: 0 } }, { mode: 'adaptive', level: 3 })).toBe(true)
    expect(evaluateWhen({ mode: 'adaptive', level: { gt: 0 } }, { mode: 'adaptive', level: 0 })).toBe(false)
  })
})
