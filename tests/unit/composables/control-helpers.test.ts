import { describe, it, expect } from 'vitest'
import { clampControlNumber, isDeviceOptions } from '@/composables/useControlHelpers'

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
