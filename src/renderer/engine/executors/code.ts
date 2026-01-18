/**
 * Code Node Executors
 *
 * These executors handle code execution and expressions:
 * - Function node (JavaScript sandbox)
 * - Expression node (inline math)
 * - Template node (string interpolation)
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// Cache for compiled functions and state
// eslint-disable-next-line @typescript-eslint/ban-types
const compiledFunctions = new Map<string, Function>()
const nodeState = new Map<string, unknown>()

/**
 * Helper to get cached value
 */
function getCached<T>(key: string, defaultValue: T): T {
  const val = nodeState.get(key)
  return val !== undefined ? (val as T) : defaultValue
}

/**
 * Helper to set cached value
 */
function setCached(key: string, value: unknown): void {
  nodeState.set(key, value)
}

// ============================================================================
// Function Node (JavaScript Sandbox)
// ============================================================================

export const functionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const code = (ctx.controls.get('code') as string) ?? ''
  const outputs = new Map<string, unknown>()

  if (!code.trim()) {
    outputs.set('result', null)
    outputs.set('error', null)
    return outputs
  }

  // Get all inputs as an object
  const inputs: Record<string, unknown> = {}
  ctx.inputs.forEach((value, key) => {
    inputs[key] = value
  })

  // Get all controls as an object
  const controls: Record<string, unknown> = {}
  ctx.controls.forEach((value, key) => {
    if (key !== 'code') {
      controls[key] = value
    }
  })

  // Create execution context for the function
  const execContext = {
    inputs,
    controls,
    time: ctx.totalTime,
    deltaTime: ctx.deltaTime,
    frame: ctx.frameCount,
    // State management
    getState: (key: string, defaultValue: unknown = null) =>
      getCached(`${ctx.nodeId}:state:${key}`, defaultValue),
    setState: (key: string, value: unknown) =>
      setCached(`${ctx.nodeId}:state:${key}`, value),
    // Math helpers
    Math,
    // Utility functions
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    clamp: (v: number, min: number, max: number) => Math.min(max, Math.max(min, v)),
    map: (v: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
      const t = (v - inMin) / (inMax - inMin)
      return outMin + t * (outMax - outMin)
    },
  }

  try {
    // Check if we need to recompile
    const cacheKey = `${ctx.nodeId}:fn`
    const codeHash = `${ctx.nodeId}:${code}`
    let fn = compiledFunctions.get(cacheKey)
    const lastHash = getCached<string>(`${ctx.nodeId}:hash`, '')

    if (!fn || lastHash !== codeHash) {
      // Compile the function
      // The function receives the context and should return an object with outputs
      fn = new Function('ctx', `
        with (ctx) {
          ${code}
        }
      `)
      compiledFunctions.set(cacheKey, fn)
      setCached(`${ctx.nodeId}:hash`, codeHash)
    }

    // Execute
    const result = fn(execContext)

    // Handle return value
    if (result !== undefined) {
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        // If result is an object, spread it to outputs
        Object.entries(result).forEach(([key, value]) => {
          outputs.set(key, value)
        })
      } else {
        outputs.set('result', result)
      }
    }
    outputs.set('error', null)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    outputs.set('result', null)
    outputs.set('error', errorMsg)
    console.error(`[Function Node ${ctx.nodeId}] Error:`, errorMsg)
  }

  return outputs
}

// ============================================================================
// Expression Node (Inline Math)
// ============================================================================

export const expressionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const expression = (ctx.controls.get('expression') as string) ?? 'a + b'
  const outputs = new Map<string, unknown>()

  // Get inputs
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  const c = (ctx.inputs.get('c') as number) ?? 0
  const d = (ctx.inputs.get('d') as number) ?? 0

  try {
    // Create safe evaluation context
    const evalContext = {
      a, b, c, d,
      t: ctx.totalTime,
      dt: ctx.deltaTime,
      frame: ctx.frameCount,
      // Math functions
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      sqrt: Math.sqrt,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
      log: Math.log,
      exp: Math.exp,
      PI: Math.PI,
      E: Math.E,
      // Utility
      lerp: (x: number, y: number, amt: number) => x + (y - x) * amt,
      clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
      fract: (v: number) => v - Math.floor(v),
      mod: (a: number, b: number) => ((a % b) + b) % b,
      step: (edge: number, x: number) => x < edge ? 0 : 1,
      smoothstep: (e0: number, e1: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)
      },
    }

    // Check cache
    const cacheKey = `${ctx.nodeId}:expr`
    const exprHash = `${ctx.nodeId}:${expression}`
    let fn = compiledFunctions.get(cacheKey)
    const lastHash = getCached<string>(`${ctx.nodeId}:exprHash`, '')

    if (!fn || lastHash !== exprHash) {
      fn = new Function('ctx', `with (ctx) { return (${expression}); }`)
      compiledFunctions.set(cacheKey, fn)
      setCached(`${ctx.nodeId}:exprHash`, exprHash)
    }

    const result = fn(evalContext)
    outputs.set('result', typeof result === 'number' ? result : 0)
    outputs.set('error', null)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    outputs.set('result', 0)
    outputs.set('error', errorMsg)
  }

  return outputs
}

// ============================================================================
// Template Node (String Interpolation)
// ============================================================================

export const templateExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const template = (ctx.controls.get('template') as string) ?? ''
  const outputs = new Map<string, unknown>()

  if (!template) {
    outputs.set('output', '')
    return outputs
  }

  // Get all inputs
  const values: Record<string, unknown> = {}
  ctx.inputs.forEach((value, key) => {
    values[key] = value
  })

  // Also add time values
  values.time = ctx.totalTime.toFixed(2)
  values.frame = ctx.frameCount

  try {
    // Simple template replacement: {{key}} -> value
    const result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = values[key]
      if (value === undefined) return match
      if (typeof value === 'number') return value.toFixed(2)
      return String(value)
    })
    outputs.set('output', result)
  } catch (error) {
    outputs.set('output', template)
  }

  return outputs
}

// ============================================================================
// Counter Node
// ============================================================================

export const counterExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const increment = ctx.inputs.get('increment') as boolean | undefined
  const decrement = ctx.inputs.get('decrement') as boolean | undefined
  const reset = ctx.inputs.get('reset') as boolean | undefined
  const setValue = ctx.inputs.get('set') as number | undefined

  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 100
  const step = (ctx.controls.get('step') as number) ?? 1
  const wrap = (ctx.controls.get('wrap') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // Get current count
  let count = getCached<number>(`${ctx.nodeId}:count`, min)
  const lastIncrement = getCached<boolean>(`${ctx.nodeId}:lastInc`, false)
  const lastDecrement = getCached<boolean>(`${ctx.nodeId}:lastDec`, false)
  const lastReset = getCached<boolean>(`${ctx.nodeId}:lastReset`, false)

  // Handle reset (edge trigger)
  if (reset && !lastReset) {
    count = min
  }

  // Handle set value
  if (setValue !== undefined) {
    count = setValue
  }

  // Handle increment (edge trigger)
  if (increment && !lastIncrement) {
    count += step
    if (count > max) {
      count = wrap ? min : max
    }
  }

  // Handle decrement (edge trigger)
  if (decrement && !lastDecrement) {
    count -= step
    if (count < min) {
      count = wrap ? max : min
    }
  }

  // Store state
  setCached(`${ctx.nodeId}:count`, count)
  setCached(`${ctx.nodeId}:lastInc`, !!increment)
  setCached(`${ctx.nodeId}:lastDec`, !!decrement)
  setCached(`${ctx.nodeId}:lastReset`, !!reset)

  outputs.set('count', count)
  outputs.set('normalized', (count - min) / (max - min))
  outputs.set('atMin', count <= min)
  outputs.set('atMax', count >= max)

  return outputs
}

// ============================================================================
// Toggle Node
// ============================================================================

export const toggleExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger') as boolean | undefined
  const set = ctx.inputs.get('set') as boolean | undefined
  const reset = ctx.inputs.get('reset') as boolean | undefined
  const initialValue = (ctx.controls.get('initial') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // Get current state
  let state = getCached<boolean>(`${ctx.nodeId}:state`, initialValue)
  const lastTrigger = getCached<boolean>(`${ctx.nodeId}:lastTrigger`, false)
  const lastSet = getCached<boolean>(`${ctx.nodeId}:lastSet`, false)
  const lastReset = getCached<boolean>(`${ctx.nodeId}:lastReset`, false)

  // Handle toggle (edge trigger)
  if (trigger && !lastTrigger) {
    state = !state
  }

  // Handle set (edge trigger)
  if (set && !lastSet) {
    state = true
  }

  // Handle reset (edge trigger)
  if (reset && !lastReset) {
    state = false
  }

  // Store state
  setCached(`${ctx.nodeId}:state`, state)
  setCached(`${ctx.nodeId}:lastTrigger`, !!trigger)
  setCached(`${ctx.nodeId}:lastSet`, !!set)
  setCached(`${ctx.nodeId}:lastReset`, !!reset)

  outputs.set('value', state)
  outputs.set('inverted', !state)
  outputs.set('number', state ? 1 : 0)

  return outputs
}

// ============================================================================
// Sample & Hold Node
// ============================================================================

export const sampleHoldExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input')
  const trigger = ctx.inputs.get('trigger') as boolean | undefined

  const outputs = new Map<string, unknown>()

  // Get held value
  let held = getCached(`${ctx.nodeId}:held`, input)
  const lastTrigger = getCached<boolean>(`${ctx.nodeId}:lastTrigger`, false)

  // Sample on rising edge
  if (trigger && !lastTrigger) {
    held = input
    setCached(`${ctx.nodeId}:held`, held)
  }

  setCached(`${ctx.nodeId}:lastTrigger`, !!trigger)

  outputs.set('output', held)

  return outputs
}

// ============================================================================
// Delay Node (for values, not audio)
// ============================================================================

export const valueDelayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input')
  const frames = (ctx.controls.get('frames') as number) ?? 1

  const outputs = new Map<string, unknown>()

  // Get buffer
  const buffer = getCached<unknown[]>(`${ctx.nodeId}:buffer`, [])

  // Add current input to buffer
  buffer.push(input)

  // Limit buffer size
  while (buffer.length > frames + 1) {
    buffer.shift()
  }

  // Output delayed value
  const delayedValue = buffer.length > frames ? buffer[0] : input

  setCached(`${ctx.nodeId}:buffer`, buffer)

  outputs.set('output', delayedValue)

  return outputs
}

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeCodeNode(nodeId: string): void {
  // Clear compiled functions
  compiledFunctions.delete(`${nodeId}:fn`)
  compiledFunctions.delete(`${nodeId}:expr`)

  // Clear state
  const keys = Array.from(nodeState.keys()).filter(k => k.startsWith(nodeId))
  keys.forEach(k => nodeState.delete(k))
}

export function disposeAllCodeNodes(): void {
  compiledFunctions.clear()
  nodeState.clear()
}

// ============================================================================
// Registry
// ============================================================================

export const codeExecutors: Record<string, NodeExecutorFn> = {
  'function': functionExecutor,
  'expression': expressionExecutor,
  'template': templateExecutor,
  'counter': counterExecutor,
  'toggle': toggleExecutor,
  'sample-hold': sampleHoldExecutor,
  'value-delay': valueDelayExecutor,
}
