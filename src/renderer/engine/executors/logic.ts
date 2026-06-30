/**
 * Logic node executors — boolean / comparison / routing (compare, and, or, not,
 * gate, select, switch). Extracted from index.ts (Phase 1 de-monolith).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

export const compareExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? (ctx.controls.get('b') as number) ?? 0
  const operator = (ctx.controls.get('operator') as string) ?? '=='

  let result: boolean
  switch (operator) {
    case '==':
      result = a === b
      break
    case '!=':
      result = a !== b
      break
    case '>':
      result = a > b
      break
    case '>=':
      result = a >= b
      break
    case '<':
      result = a < b
      break
    case '<=':
      result = a <= b
      break
    default:
      result = false
  }

  return new Map([['result', result ? 1 : 0]])
}

export const andExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a') ?? ctx.controls.get('a'))
  const b = Boolean(ctx.inputs.get('b') ?? ctx.controls.get('b'))
  return new Map([['result', a && b ? 1 : 0]])
}

export const orExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a') ?? ctx.controls.get('a'))
  const b = Boolean(ctx.inputs.get('b') ?? ctx.controls.get('b'))
  return new Map([['result', a || b ? 1 : 0]])
}

export const notExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = Boolean(ctx.inputs.get('value'))
  return new Map([['result', !value ? 1 : 0]])
}

// Gate holds last passed value
export const gateLastValue = defineNodeState<unknown>({ label: 'gate' })

export const gateExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const valueControl = ctx.controls.get('value') as string | undefined
  const value = ctx.inputs.get('value') ?? (valueControl !== '' ? valueControl : undefined)
  const gate = Boolean(ctx.inputs.get('gate') ?? ctx.controls.get('open') ?? true)

  // Only update stored value when gate is open and value is defined
  if (gate && value !== undefined) {
    gateLastValue.set(ctx.nodeId, value)
  }

  return new Map([['result', gateLastValue.get(ctx.nodeId)]])
}

export const selectExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const index = Math.floor((ctx.inputs.get('index') as number) ?? 0)
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')
  const c = ctx.inputs.get('c')
  const d = ctx.inputs.get('d')

  const inputs = [a, b, c, d].filter(v => v !== undefined)
  const selected = inputs[Math.max(0, Math.min(index, inputs.length - 1))]

  return new Map([['result', selected]])
}

export const switchExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const condition = Boolean(ctx.inputs.get('condition'))
  const trueValue = ctx.inputs.get('true') ?? 1
  const falseValue = ctx.inputs.get('false') ?? 0
  return new Map([['result', condition ? trueValue : falseValue]])
}
