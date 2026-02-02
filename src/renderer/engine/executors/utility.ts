/**
 * Utility Node Executors
 *
 * Executors for value checking, type comparison, and flow control nodes
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// ============================================================================
// State Management for Stateful Nodes
// ============================================================================

// Changed node state: stores previous value
const changedPrevValue = new Map<string, unknown>()

// Sample & Hold state: stores held value
const sampleHoldValue = new Map<string, unknown>()

// Latch state: stores boolean state
const latchState = new Map<string, boolean>()

// Counter state: stores count
const counterState = new Map<string, number>()

// Debounce state: stores timer and pending value
const debounceState = new Map<string, { value: unknown; lastChange: number; settled: boolean }>()

// Throttle state: stores last output time and value
const throttleState = new Map<string, { lastOutput: number; value: unknown }>()

// ============================================================================
// Value Checking Nodes
// ============================================================================

export const isNullExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const result = value === null || value === undefined
  return new Map([['result', result ? 1 : 0]])
}

export const isEmptyExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')

  let isEmpty = false
  let type = 'not-empty'

  if (value === null) {
    isEmpty = true
    type = 'null'
  } else if (value === undefined) {
    isEmpty = true
    type = 'undefined'
  } else if (typeof value === 'string' && value === '') {
    isEmpty = true
    type = 'empty-string'
  } else if (Array.isArray(value) && value.length === 0) {
    isEmpty = true
    type = 'empty-array'
  }

  const outputs = new Map<string, unknown>()
  outputs.set('result', isEmpty ? 1 : 0)
  outputs.set('type', type)
  return outputs
}

export const passIfExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const condition = ctx.inputs.get('condition')
  const mode = (ctx.controls.get('mode') as string) ?? 'when-true'

  let shouldPass = false

  switch (mode) {
    case 'when-true':
      shouldPass = Boolean(condition)
      break
    case 'when-false':
      shouldPass = !condition
      break
    case 'when-not-null':
      shouldPass = value !== null && value !== undefined
      break
    case 'when-not-empty':
      shouldPass =
        value !== null &&
        value !== undefined &&
        !(typeof value === 'string' && value === '') &&
        !(Array.isArray(value) && value.length === 0)
      break
  }

  if (shouldPass) {
    return new Map([['result', value]])
  }

  // Block output - return empty map
  return new Map()
}

export const defaultValueExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const defaultVal = (ctx.controls.get('default') as string) ?? ''
  const treatEmptyAsNull = (ctx.controls.get('treatEmptyAsNull') as boolean) ?? true

  const isNullish = value === null || value === undefined
  const isEmpty = treatEmptyAsNull && (
    (typeof value === 'string' && value === '') ||
    (Array.isArray(value) && value.length === 0)
  )

  if (isNullish || isEmpty) {
    // Try to parse default as JSON, otherwise return as string
    try {
      return new Map([['result', JSON.parse(defaultVal)]])
    } catch {
      return new Map([['result', defaultVal]])
    }
  }

  return new Map([['result', value]])
}

export const coalesceExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')
  const c = ctx.inputs.get('c')
  const d = ctx.inputs.get('d')

  // Return first non-null/undefined value
  const values = [a, b, c, d]
  for (const val of values) {
    if (val !== null && val !== undefined) {
      return new Map([['result', val]])
    }
  }

  return new Map([['result', null]])
}

// ============================================================================
// Type-Agnostic Comparison Nodes
// ============================================================================

export const equalsExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const aControl = ctx.controls.get('a') as string | undefined
  const bControl = ctx.controls.get('b') as string | undefined
  const a = ctx.inputs.get('a') ?? (aControl !== '' ? aControl : undefined)
  const b = ctx.inputs.get('b') ?? (bControl !== '' ? bControl : undefined)
  const strict = (ctx.controls.get('strict') as boolean) ?? true

  let result: boolean

  if (strict) {
    // Deep equality for objects/arrays
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      result = JSON.stringify(a) === JSON.stringify(b)
    } else {
      result = a === b
    }
  } else {
    // eslint-disable-next-line eqeqeq
    result = a == b
  }

  return new Map([['result', result ? 1 : 0]])
}

export const typeOfExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')

  let type: string

  if (value === null) {
    type = 'null'
  } else if (value === undefined) {
    type = 'undefined'
  } else if (Array.isArray(value)) {
    type = 'array'
  } else {
    type = typeof value
  }

  return new Map([['type', type]])
}

export const inRangeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? (ctx.controls.get('value') as number) ?? 0
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  const inclusive = (ctx.controls.get('inclusive') as boolean) ?? true

  let result: boolean
  if (inclusive) {
    result = value >= min && value <= max
  } else {
    result = value > min && value < max
  }

  return new Map([['result', result ? 1 : 0]])
}

// ============================================================================
// Match Value Node
// ============================================================================

export const matchValueExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const target = (ctx.controls.get('target') as string) ?? ''
  const compareType = (ctx.controls.get('type') as string) ?? 'auto'

  if (target === '') {
    return new Map([['result', 0], ['value', value]])
  }

  let coercedValue: unknown = value
  let coercedTarget: unknown = target

  switch (compareType) {
    case 'number': {
      coercedValue = Number(value)
      coercedTarget = Number(target)
      break
    }
    case 'string': {
      coercedValue = String(value ?? '')
      coercedTarget = target
      break
    }
    case 'boolean': {
      coercedValue = Boolean(value)
      coercedTarget = target === 'true' || target === '1'
      break
    }
    case 'auto':
    default: {
      // Try number first
      const numTarget = Number(target)
      if (!isNaN(numTarget) && target.trim() !== '') {
        coercedValue = Number(value)
        coercedTarget = numTarget
      } else if (target === 'true' || target === 'false') {
        coercedValue = Boolean(value)
        coercedTarget = target === 'true'
      } else {
        coercedValue = String(value ?? '')
        coercedTarget = target
      }
      break
    }
  }

  const result = coercedValue === coercedTarget
  return new Map([['result', result ? 1 : 0], ['value', value]])
}

// ============================================================================
// State/Memory Nodes
// ============================================================================

export const changedExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const prev = changedPrevValue.get(ctx.nodeId)

  // Compare values (deep compare for objects)
  let hasChanged: boolean
  if (typeof value === 'object' && typeof prev === 'object' && value !== null && prev !== null) {
    hasChanged = JSON.stringify(value) !== JSON.stringify(prev)
  } else {
    hasChanged = value !== prev
  }

  changedPrevValue.set(ctx.nodeId, value)

  if (hasChanged) {
    return new Map([
      ['result', value],
      ['changed', 1],
    ])
  }

  return new Map([
    ['result', undefined],
    ['changed', 0],
  ])
}

export const sampleHoldExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const trigger = ctx.inputs.get('trigger')

  // Check for trigger (truthy value)
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  if (hasTrigger && value !== undefined) {
    sampleHoldValue.set(ctx.nodeId, value)
  }

  return new Map([['result', sampleHoldValue.get(ctx.nodeId)]])
}

export const latchExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const setTrigger = ctx.inputs.get('set')
  const resetTrigger = ctx.inputs.get('reset')
  const initialState = (ctx.controls.get('initialState') as boolean) ?? false

  // Initialize state if not exists
  if (!latchState.has(ctx.nodeId)) {
    latchState.set(ctx.nodeId, initialState)
  }

  const hasSet = setTrigger === true || setTrigger === 1 || (typeof setTrigger === 'number' && setTrigger > 0)
  const hasReset = resetTrigger === true || resetTrigger === 1 || (typeof resetTrigger === 'number' && resetTrigger > 0)

  // Reset takes priority
  if (hasReset) {
    latchState.set(ctx.nodeId, false)
  } else if (hasSet) {
    latchState.set(ctx.nodeId, true)
  }

  return new Map([['result', latchState.get(ctx.nodeId) ? 1 : 0]])
}

// ============================================================================
// Flow Control Nodes
// ============================================================================

export const routerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const route = Math.floor((ctx.inputs.get('route') as number) ?? 0)

  const outputs = new Map<string, unknown>()

  // Clamp route to valid range (0-3)
  const clampedRoute = Math.max(0, Math.min(3, route))

  // Only output to the selected route
  outputs.set(`out${clampedRoute}`, value)

  return outputs
}

export const counterExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const incrementTrigger = ctx.inputs.get('increment')
  const decrementTrigger = ctx.inputs.get('decrement')
  const resetTrigger = ctx.inputs.get('reset')
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 100
  const wrap = (ctx.controls.get('wrap') as boolean) ?? false
  const initial = (ctx.controls.get('initial') as number) ?? 0

  // Initialize state if not exists
  if (!counterState.has(ctx.nodeId)) {
    counterState.set(ctx.nodeId, initial)
  }

  let count = counterState.get(ctx.nodeId)!

  const hasIncrement = incrementTrigger === true || incrementTrigger === 1 || (typeof incrementTrigger === 'number' && incrementTrigger > 0)
  const hasDecrement = decrementTrigger === true || decrementTrigger === 1 || (typeof decrementTrigger === 'number' && decrementTrigger > 0)
  const hasReset = resetTrigger === true || resetTrigger === 1 || (typeof resetTrigger === 'number' && resetTrigger > 0)

  if (hasReset) {
    count = initial
  } else {
    if (hasIncrement) {
      count++
      if (count > max) {
        count = wrap ? min : max
      }
    }
    if (hasDecrement) {
      count--
      if (count < min) {
        count = wrap ? max : min
      }
    }
  }

  counterState.set(ctx.nodeId, count)

  return new Map([['count', count]])
}

export const debounceExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const delay = (ctx.controls.get('delay') as number) ?? 300

  const currentTime = ctx.totalTime * 1000

  let state = debounceState.get(ctx.nodeId)
  if (!state) {
    state = { value: undefined, lastChange: currentTime, settled: true }
    debounceState.set(ctx.nodeId, state)
  }

  // Check if value changed
  const valueChanged = JSON.stringify(value) !== JSON.stringify(state.value)

  if (valueChanged) {
    state.value = value
    state.lastChange = currentTime
    state.settled = false
  }

  // Check if delay has passed since last change
  if (!state.settled && currentTime - state.lastChange >= delay) {
    state.settled = true
    return new Map([['result', state.value]])
  }

  // Return previous settled value or undefined
  if (state.settled) {
    return new Map([['result', state.value]])
  }

  return new Map()
}

export const throttleExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const interval = (ctx.controls.get('interval') as number) ?? 100

  const currentTime = ctx.totalTime * 1000

  let state = throttleState.get(ctx.nodeId)
  if (!state) {
    state = { lastOutput: -Infinity, value: undefined }
    throttleState.set(ctx.nodeId, state)
  }

  // Check if enough time has passed
  if (currentTime - state.lastOutput >= interval) {
    state.lastOutput = currentTime
    state.value = value
    return new Map([['result', value]])
  }

  // Return last value
  return new Map([['result', state.value]])
}

// ============================================================================
// Dispatch Node
// ============================================================================

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

interface DispatchCondition {
  operator: string
  value: string
  type: string
}

function evaluateCondition(testValue: unknown, condition: DispatchCondition): boolean {
  const { operator, value: condValue, type: condType } = condition

  // No-argument operators
  if (operator === 'otherwise') return true
  if (operator === 'is true') return Boolean(testValue)
  if (operator === 'is empty') {
    return testValue === null ||
      testValue === undefined ||
      (typeof testValue === 'string' && testValue === '') ||
      (Array.isArray(testValue) && testValue.length === 0)
  }
  if (operator === 'is type') return typeof testValue === condValue

  // Coerce comparison value
  let target: unknown = condValue
  let test: unknown = testValue

  if (condType === 'number' || (!isNaN(Number(condValue)) && condValue.trim() !== '')) {
    target = Number(condValue)
    test = Number(testValue)
  }

  switch (operator) {
    case '==': return test === target
    case '!=': return test !== target
    case '>': return (test as number) > (target as number)
    case '>=': return (test as number) >= (target as number)
    case '<': return (test as number) < (target as number)
    case '<=': return (test as number) <= (target as number)
    case 'contains': return String(testValue).includes(String(condValue))
    case 'matches regex': {
      try {
        return new RegExp(condValue).test(String(testValue))
      } catch {
        return false
      }
    }
    default: return false
  }
}

export const dispatchExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const conditionsJson = (ctx.controls.get('conditions') as string) ?? '[]'
  const property = (ctx.controls.get('property') as string) ?? ''
  const checkAll = (ctx.controls.get('checkAll') as boolean) ?? false

  let conditions: DispatchCondition[]
  try {
    conditions = JSON.parse(conditionsJson)
  } catch {
    conditions = []
  }

  // Resolve property path if specified
  const testValue = property ? getNestedValue(value, property) : value

  const outputs = new Map<string, unknown>()
  for (let i = 0; i < conditions.length; i++) {
    if (evaluateCondition(testValue, conditions[i])) {
      outputs.set(`out-${i}`, value) // pass original value through
      if (!checkAll) break
    }
  }
  return outputs
}

// ============================================================================
// Cleanup Functions
// ============================================================================

export function disposeUtilityNode(nodeId: string): void {
  changedPrevValue.delete(nodeId)
  sampleHoldValue.delete(nodeId)
  latchState.delete(nodeId)
  counterState.delete(nodeId)
  debounceState.delete(nodeId)
  throttleState.delete(nodeId)
}

export function disposeAllUtilityState(): void {
  changedPrevValue.clear()
  sampleHoldValue.clear()
  latchState.clear()
  counterState.clear()
  debounceState.clear()
  throttleState.clear()
}

// ============================================================================
// Registry
// ============================================================================

export const utilityExecutors: Record<string, NodeExecutorFn> = {
  // Value checking
  'is-null': isNullExecutor,
  'is-empty': isEmptyExecutor,
  'pass-if': passIfExecutor,
  'default-value': defaultValueExecutor,
  'coalesce': coalesceExecutor,
  // Type comparison
  'equals': equalsExecutor,
  'type-of': typeOfExecutor,
  'in-range': inRangeExecutor,
  'match-value': matchValueExecutor,
  'dispatch': dispatchExecutor,
  // State/memory
  'changed': changedExecutor,
  'sample-hold': sampleHoldExecutor,
  'latch': latchExecutor,
  // Flow control
  'router': routerExecutor,
  'counter': counterExecutor,
  'debounce': debounceExecutor,
  'throttle': throttleExecutor,
}
