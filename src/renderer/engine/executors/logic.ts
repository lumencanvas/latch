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
  const gateIn = ctx.inputs.get('gate')
  const open = gateIn !== undefined ? ctx.bool('gate') : ((ctx.controls.get('open') as boolean) ?? true)
  const whenClosed = (ctx.controls.get('whenClosed') as string) ?? 'hold'

  if (open) {
    // OPEN = transparent: pass the CURRENT value, including "nothing". The old version
    // always emitted the last stored value, so a 1-frame trigger passing an open gate became
    // a permanently-high output (downstream edge detectors fired once, never again).
    if (value !== undefined) gateLastValue.set(ctx.nodeId, value)
    return new Map([['result', value]])
  }

  // CLOSED: hold the last passed value (freeze), or block entirely. Use 'block' for
  // trigger streams so a held pulse can't read as a stuck-high signal.
  return new Map([['result', whenClosed === 'block' ? undefined : gateLastValue.get(ctx.nodeId)]])
}
