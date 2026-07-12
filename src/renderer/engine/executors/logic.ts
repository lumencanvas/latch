/**
 * Logic node executors — the stateful remainder. `gate` holds its last passed
 * value via defineNodeState. The pure logic nodes (compare/and/or/not/select/switch)
 * are co-located in registry/logic/<node>/node.ts (Phase 6).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

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
