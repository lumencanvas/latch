/**
 * Math Executor Tests
 *
 * Comprehensive tests for trigonometry, power, vector math, and modulo executors
 */

import { describe, it, expect } from 'vitest'
import {
  trigExecutor,
  powerExecutor,
  vectorMathExecutor,
  moduloExecutor,
} from '@/engine/executors/index'
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

// Tolerance for floating-point comparisons
const EPSILON = 1e-10

describe('Math Executors', () => {
  // ============================================================================
  // Trigonometry Executor
  // ============================================================================
  describe('trigExecutor', () => {
    describe('sin function', () => {
      it('calculates sin in radians', () => {
        const ctx = createContext({ value: 0 }, { function: 'sin', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('calculates sin(π/2) = 1', () => {
        const ctx = createContext(
          { value: Math.PI / 2 },
          { function: 'sin', degrees: false }
        )
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('calculates sin(90°) = 1 when degrees mode', () => {
        const ctx = createContext({ value: 90 }, { function: 'sin', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('calculates sin(30°) = 0.5', () => {
        const ctx = createContext({ value: 30 }, { function: 'sin', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0.5, 10)
      })
    })

    describe('cos function', () => {
      it('calculates cos(0) = 1', () => {
        const ctx = createContext({ value: 0 }, { function: 'cos', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('calculates cos(π) = -1', () => {
        const ctx = createContext({ value: Math.PI }, { function: 'cos', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(-1, 10)
      })

      it('calculates cos(60°) = 0.5', () => {
        const ctx = createContext({ value: 60 }, { function: 'cos', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0.5, 10)
      })
    })

    describe('tan function', () => {
      it('calculates tan(0) = 0', () => {
        const ctx = createContext({ value: 0 }, { function: 'tan', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('calculates tan(45°) = 1', () => {
        const ctx = createContext({ value: 45 }, { function: 'tan', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('handles tan(90°) approaching infinity', () => {
        const ctx = createContext({ value: 90 }, { function: 'tan', degrees: true })
        const result = trigExecutor(ctx)
        // tan(90°) is technically undefined, but in floating point it's a very large number
        expect(Math.abs(result.get('result') as number)).toBeGreaterThan(1e10)
      })
    })

    describe('inverse trig functions', () => {
      it('calculates asin(0) = 0', () => {
        const ctx = createContext({ value: 0 }, { function: 'asin', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('calculates asin(1) = π/2', () => {
        const ctx = createContext({ value: 1 }, { function: 'asin', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(Math.PI / 2, 10)
      })

      it('calculates asin(0.5) = 30° in degrees mode', () => {
        const ctx = createContext({ value: 0.5 }, { function: 'asin', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(30, 10)
      })

      it('calculates acos(1) = 0', () => {
        const ctx = createContext({ value: 1 }, { function: 'acos', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('calculates acos(0.5) = 60° in degrees mode', () => {
        const ctx = createContext({ value: 0.5 }, { function: 'acos', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(60, 10)
      })

      it('calculates atan(1) = π/4', () => {
        const ctx = createContext({ value: 1 }, { function: 'atan', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(Math.PI / 4, 10)
      })

      it('calculates atan(1) = 45° in degrees mode', () => {
        const ctx = createContext({ value: 1 }, { function: 'atan', degrees: true })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(45, 10)
      })

      it('returns NaN for asin out of range [-1, 1]', () => {
        const ctx = createContext({ value: 2 }, { function: 'asin', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeNaN()
      })

      it('returns NaN for acos out of range [-1, 1]', () => {
        const ctx = createContext({ value: -2 }, { function: 'acos', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeNaN()
      })
    })

    describe('hyperbolic functions', () => {
      it('calculates sinh(0) = 0', () => {
        const ctx = createContext({ value: 0 }, { function: 'sinh', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('calculates cosh(0) = 1', () => {
        const ctx = createContext({ value: 0 }, { function: 'cosh', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('calculates tanh(0) = 0', () => {
        const ctx = createContext({ value: 0 }, { function: 'tanh', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('tanh approaches 1 for large positive values', () => {
        const ctx = createContext({ value: 10 }, { function: 'tanh', degrees: false })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 5)
      })
    })

    describe('edge cases', () => {
      it('handles undefined input as 0', () => {
        const ctx = createContext({}, { function: 'sin' })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })

      it('defaults to sin for unknown function', () => {
        const ctx = createContext({ value: Math.PI / 2 }, { function: 'unknown' })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('defaults to radians when degrees not specified', () => {
        const ctx = createContext({ value: Math.PI }, { function: 'sin' })
        const result = trigExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(0, 10)
      })
    })
  })

  // ============================================================================
  // Power Executor
  // ============================================================================
  describe('powerExecutor', () => {
    describe('Power operation', () => {
      it('calculates 2^3 = 8', () => {
        const ctx = createContext({ base: 2, exponent: 3 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(8)
      })

      it('calculates 10^0 = 1', () => {
        const ctx = createContext({ base: 10, exponent: 0 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('calculates negative exponents', () => {
        const ctx = createContext({ base: 2, exponent: -2 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0.25)
      })

      it('calculates fractional exponents', () => {
        const ctx = createContext({ base: 4, exponent: 0.5 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(2)
      })

      it('uses control exponent when input not provided', () => {
        const ctx = createContext({ base: 3 }, { operation: 'Power', exponent: 2 })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(9)
      })
    })

    describe('Sqrt operation', () => {
      it('calculates sqrt(16) = 4', () => {
        const ctx = createContext({ base: 16 }, { operation: 'Sqrt' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(4)
      })

      it('calculates sqrt(2)', () => {
        const ctx = createContext({ base: 2 }, { operation: 'Sqrt' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(Math.SQRT2, 10)
      })

      it('handles sqrt(0) = 0', () => {
        const ctx = createContext({ base: 0 }, { operation: 'Sqrt' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('returns 0 for sqrt of negative (NaN handled)', () => {
        const ctx = createContext({ base: -4 }, { operation: 'Sqrt' })
        const result = powerExecutor(ctx)
        // NaN is converted to 0 by the executor
        expect(result.get('result')).toBe(0)
      })
    })

    describe('Cbrt operation', () => {
      it('calculates cbrt(27) = 3', () => {
        const ctx = createContext({ base: 27 }, { operation: 'Cbrt' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(3)
      })

      it('handles negative numbers (unlike sqrt)', () => {
        const ctx = createContext({ base: -8 }, { operation: 'Cbrt' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(-2)
      })
    })

    describe('Log operations', () => {
      it('calculates log base 10 of 100 = 2', () => {
        const ctx = createContext({ base: 100, exponent: 10 }, { operation: 'Log' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(2, 10)
      })

      it('calculates log base 2 of 8 = 3', () => {
        const ctx = createContext({ base: 8, exponent: 2 }, { operation: 'Log' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(3, 10)
      })

      it('returns 0 for log(0) (NaN handled)', () => {
        const ctx = createContext({ base: 0, exponent: 10 }, { operation: 'Log' })
        const result = powerExecutor(ctx)
        // log(0) = -Infinity, which is not NaN but Infinity
        // Current implementation converts NaN to 0 but not Infinity
        const r = result.get('result') as number
        expect(r === 0 || !Number.isFinite(r)).toBe(true)
      })

      it('returns NaN (as 0) for log of negative', () => {
        const ctx = createContext({ base: -10, exponent: 10 }, { operation: 'Log' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('handles log base 1 (returns Infinity)', () => {
        const ctx = createContext({ base: 10, exponent: 1 }, { operation: 'Log' })
        const result = powerExecutor(ctx)
        // log(10) / log(1) = log(10) / 0 = Infinity
        const r = result.get('result') as number
        expect(!Number.isFinite(r) || r === 0).toBe(true)
      })
    })

    describe('Log10 operation', () => {
      it('calculates log10(1000) = 3', () => {
        const ctx = createContext({ base: 1000 }, { operation: 'Log10' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(3, 10)
      })

      it('calculates log10(1) = 0', () => {
        const ctx = createContext({ base: 1 }, { operation: 'Log10' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })
    })

    describe('Ln operation', () => {
      it('calculates ln(e) = 1', () => {
        const ctx = createContext({ base: Math.E }, { operation: 'Ln' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1, 10)
      })

      it('calculates ln(1) = 0', () => {
        const ctx = createContext({ base: 1 }, { operation: 'Ln' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })
    })

    describe('Exp operation', () => {
      it('calculates e^1 = e', () => {
        const ctx = createContext({ base: 1 }, { operation: 'Exp' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(Math.E, 10)
      })

      it('calculates e^0 = 1', () => {
        const ctx = createContext({ base: 0 }, { operation: 'Exp' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('handles large exponents', () => {
        // e^100 is a very large number but not Infinity (~2.69e43)
        // e^710 is approximately the threshold for Infinity in JavaScript
        const ctx = createContext({ base: 710 }, { operation: 'Exp' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(Infinity)
      })
    })

    describe('edge cases', () => {
      it('handles 0^0 = 1', () => {
        const ctx = createContext({ base: 0, exponent: 0 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('handles 0^positive = 0', () => {
        const ctx = createContext({ base: 0, exponent: 5 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('handles 0^negative = Infinity', () => {
        const ctx = createContext({ base: 0, exponent: -1 }, { operation: 'Power' })
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(Infinity)
      })

      it('defaults to Power operation', () => {
        const ctx = createContext({ base: 2, exponent: 3 }, {})
        const result = powerExecutor(ctx)
        expect(result.get('result')).toBe(8)
      })
    })
  })

  // ============================================================================
  // Vector Math Executor
  // ============================================================================
  describe('vectorMathExecutor', () => {
    describe('Add operation', () => {
      it('adds two vectors', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3, bx: 4, by: 5, bz: 6 },
          { operation: 'Add' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(5)
        expect(result.get('y')).toBe(7)
        expect(result.get('z')).toBe(9)
      })

      it('handles negative values', () => {
        const ctx = createContext(
          { ax: -1, ay: -2, az: -3, bx: 1, by: 2, bz: 3 },
          { operation: 'Add' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })
    })

    describe('Subtract operation', () => {
      it('subtracts two vectors', () => {
        const ctx = createContext(
          { ax: 5, ay: 7, az: 9, bx: 1, by: 2, bz: 3 },
          { operation: 'Subtract' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(4)
        expect(result.get('y')).toBe(5)
        expect(result.get('z')).toBe(6)
      })
    })

    describe('Cross product', () => {
      it('calculates cross product of unit vectors', () => {
        // i × j = k
        const ctx = createContext(
          { ax: 1, ay: 0, az: 0, bx: 0, by: 1, bz: 0 },
          { operation: 'Cross' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(1)
      })

      it('cross product of parallel vectors is zero', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3, bx: 2, by: 4, bz: 6 },
          { operation: 'Cross' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })
    })

    describe('Normalize operation', () => {
      it('normalizes a vector to unit length', () => {
        const ctx = createContext(
          { ax: 3, ay: 4, az: 0 },
          { operation: 'Normalize' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBeCloseTo(0.6, 10)
        expect(result.get('y')).toBeCloseTo(0.8, 10)
        expect(result.get('z')).toBe(0)
        expect(result.get('magnitude')).toBeCloseTo(1, 10)
      })

      it('handles zero vector', () => {
        const ctx = createContext(
          { ax: 0, ay: 0, az: 0 },
          { operation: 'Normalize' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })
    })

    describe('Scale operation', () => {
      it('scales vector by scalar', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3 },
          { operation: 'Scale', scalar: 2 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(2)
        expect(result.get('y')).toBe(4)
        expect(result.get('z')).toBe(6)
      })

      it('handles zero scalar', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3 },
          { operation: 'Scale', scalar: 0 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })

      it('handles negative scalar', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3 },
          { operation: 'Scale', scalar: -1 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(-1)
        expect(result.get('y')).toBe(-2)
        expect(result.get('z')).toBe(-3)
      })
    })

    describe('Lerp operation', () => {
      it('interpolates at t=0 (returns a)', () => {
        const ctx = createContext(
          { ax: 0, ay: 0, az: 0, bx: 10, by: 10, bz: 10 },
          { operation: 'Lerp', scalar: 0 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })

      it('interpolates at t=1 (returns b)', () => {
        const ctx = createContext(
          { ax: 0, ay: 0, az: 0, bx: 10, by: 10, bz: 10 },
          { operation: 'Lerp', scalar: 1 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(10)
        expect(result.get('y')).toBe(10)
        expect(result.get('z')).toBe(10)
      })

      it('interpolates at t=0.5 (midpoint)', () => {
        const ctx = createContext(
          { ax: 0, ay: 0, az: 0, bx: 10, by: 10, bz: 10 },
          { operation: 'Lerp', scalar: 0.5 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(5)
        expect(result.get('y')).toBe(5)
        expect(result.get('z')).toBe(5)
      })

      it('extrapolates beyond t=1', () => {
        const ctx = createContext(
          { ax: 0, ay: 0, az: 0, bx: 10, by: 10, bz: 10 },
          { operation: 'Lerp', scalar: 2 }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(20)
        expect(result.get('y')).toBe(20)
        expect(result.get('z')).toBe(20)
      })
    })

    describe('Dot product', () => {
      it('calculates dot product', () => {
        const ctx = createContext(
          { ax: 1, ay: 2, az: 3, bx: 4, by: 5, bz: 6 },
          { operation: 'Dot' }
        )
        const result = vectorMathExecutor(ctx)
        // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
        expect(result.get('x')).toBe(32)
        expect(result.get('y')).toBe(32)
        expect(result.get('z')).toBe(32)
      })

      it('orthogonal vectors have dot product 0', () => {
        const ctx = createContext(
          { ax: 1, ay: 0, az: 0, bx: 0, by: 1, bz: 0 },
          { operation: 'Dot' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
      })
    })

    describe('magnitude output', () => {
      it('calculates correct magnitude for 3-4-5 triangle', () => {
        const ctx = createContext(
          { ax: 3, ay: 4, az: 0, bx: 0, by: 0, bz: 0 },
          { operation: 'Add' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('magnitude')).toBe(5)
      })

      it('magnitude of unit vector is 1', () => {
        const ctx = createContext(
          { ax: 1, ay: 0, az: 0 },
          { operation: 'Normalize' }
        )
        const result = vectorMathExecutor(ctx)
        expect(result.get('magnitude')).toBeCloseTo(1, 10)
      })
    })

    describe('edge cases', () => {
      it('handles missing inputs as 0', () => {
        const ctx = createContext({}, { operation: 'Add' })
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(0)
        expect(result.get('y')).toBe(0)
        expect(result.get('z')).toBe(0)
      })

      it('defaults to Add operation', () => {
        const ctx = createContext({ ax: 1, bx: 2 }, {})
        const result = vectorMathExecutor(ctx)
        expect(result.get('x')).toBe(3)
      })
    })
  })

  // ============================================================================
  // Modulo Executor
  // ============================================================================
  describe('moduloExecutor', () => {
    describe('Standard mode', () => {
      it('calculates 7 % 3 = 1', () => {
        const ctx = createContext({ value: 7, divisor: 3 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('calculates 10 % 5 = 0', () => {
        const ctx = createContext({ value: 10, divisor: 5 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('handles negative dividend (JavaScript behavior)', () => {
        const ctx = createContext({ value: -7, divisor: 3 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        // JavaScript: -7 % 3 = -1
        expect(result.get('result')).toBe(-1)
      })

      it('handles floating point values', () => {
        const ctx = createContext({ value: 7.5, divisor: 2 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBeCloseTo(1.5, 10)
      })
    })

    describe('Positive mode', () => {
      it('returns positive for negative dividend', () => {
        const ctx = createContext({ value: -7, divisor: 3 }, { mode: 'Positive' })
        const result = moduloExecutor(ctx)
        // ((−7 % 3) + 3) % 3 = (−1 + 3) % 3 = 2 % 3 = 2
        expect(result.get('result')).toBe(2)
      })

      it('works same as standard for positive values', () => {
        const ctx = createContext({ value: 7, divisor: 3 }, { mode: 'Positive' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('handles -1 % 5', () => {
        const ctx = createContext({ value: -1, divisor: 5 }, { mode: 'Positive' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(4)
      })
    })

    describe('Floor mode (Python-style)', () => {
      it('calculates floor modulo for negative dividend', () => {
        const ctx = createContext({ value: -7, divisor: 3 }, { mode: 'Floor' })
        const result = moduloExecutor(ctx)
        // -7 - 3 * floor(-7/3) = -7 - 3 * (-3) = -7 + 9 = 2
        expect(result.get('result')).toBe(2)
      })

      it('same as standard for positive values', () => {
        const ctx = createContext({ value: 7, divisor: 3 }, { mode: 'Floor' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })
    })

    describe('division by zero', () => {
      it('returns 0 for divisor = 0', () => {
        const ctx = createContext({ value: 10, divisor: 0 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('returns 0 for divisor = 0 in Positive mode', () => {
        const ctx = createContext({ value: 10, divisor: 0 }, { mode: 'Positive' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('returns 0 for divisor = 0 in Floor mode', () => {
        const ctx = createContext({ value: 10, divisor: 0 }, { mode: 'Floor' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })
    })

    describe('input priority', () => {
      it('uses input divisor over control', () => {
        const ctx = createContext(
          { value: 10, divisor: 3 },
          { mode: 'Standard', divisor: 4 }
        )
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(1) // 10 % 3 = 1
      })

      it('uses control divisor when input not provided', () => {
        const ctx = createContext(
          { value: 10 },
          { mode: 'Standard', divisor: 4 }
        )
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(2) // 10 % 4 = 2
      })
    })

    describe('edge cases', () => {
      it('handles 0 % n = 0', () => {
        const ctx = createContext({ value: 0, divisor: 5 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('handles n % 1 = 0', () => {
        const ctx = createContext({ value: 7, divisor: 1 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0)
      })

      it('defaults to Standard mode', () => {
        const ctx = createContext({ value: 7, divisor: 3 }, {})
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(1)
      })

      it('defaults divisor to 1', () => {
        const ctx = createContext({ value: 7 }, { mode: 'Standard' })
        const result = moduloExecutor(ctx)
        expect(result.get('result')).toBe(0) // 7 % 1 = 0
      })
    })
  })
})
