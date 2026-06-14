import { describe, it, expect, afterEach, vi } from 'vitest'
import { prefersReducedMotion, clampDevicePixelRatio } from '@/utils/platform'

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when the OS does not request reduced motion', () => {
    // tests/setup.ts mocks matchMedia to always report matches: false
    expect(prefersReducedMotion()).toBe(false)
  })

  it('returns true when the reduce media query matches', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(prefersReducedMotion()).toBe(true)
  })
})

describe('clampDevicePixelRatio', () => {
  afterEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
  })

  it('caps a high-DPR display to the max', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 })
    expect(clampDevicePixelRatio(2)).toBe(2)
    expect(clampDevicePixelRatio(1.5)).toBe(1.5)
  })

  it('leaves a low DPR untouched and defaults max to 2', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
    expect(clampDevicePixelRatio()).toBe(1)
  })
})
