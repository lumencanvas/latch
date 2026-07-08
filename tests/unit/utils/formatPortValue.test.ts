import { describe, it, expect } from 'vitest'
import { formatPortValue } from '@/utils/formatPortValue'

describe('formatPortValue', () => {
  it('renders integers as-is and trims trailing zeros on floats', () => {
    expect(formatPortValue(5)).toBe('5')
    expect(formatPortValue(-3)).toBe('-3')
    expect(formatPortValue(1.5)).toBe('1.5')
    expect(formatPortValue(1 / 3)).toBe('0.333')
    expect(formatPortValue(2.0)).toBe('2') // 2.0 is integer-valued
  })

  it('renders non-finite numbers verbatim', () => {
    expect(formatPortValue(NaN)).toBe('NaN')
    expect(formatPortValue(Infinity)).toBe('Infinity')
  })

  it('renders booleans as true/false', () => {
    expect(formatPortValue(true)).toBe('true')
    expect(formatPortValue(false)).toBe('false')
  })

  it('quotes strings and truncates long ones', () => {
    expect(formatPortValue('hi')).toBe('"hi"')
    expect(formatPortValue('x'.repeat(40))).toBe(`"${'x'.repeat(23)}…"`)
  })

  it('summarises arrays by length and objects compactly', () => {
    expect(formatPortValue([1, 2, 3])).toBe('[3]')
    expect(formatPortValue([])).toBe('[0]')
    expect(formatPortValue({ a: 1, b: 2 })).toBe('{…}')
  })

  it('renders null and undefined distinctly', () => {
    expect(formatPortValue(null)).toBe('null')
    expect(formatPortValue(undefined)).toBe('—')
  })
})
