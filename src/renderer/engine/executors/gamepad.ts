/**
 * Gamepad + Visual Gamepad executors.
 *
 * The Web Gamepad API has no reliable per-state events, so the executor polls
 * navigator.getGamepads() each frame (the engine already runs a per-frame rAF
 * loop) and normalizes to the unified ControllerState. The Visual Gamepad merges
 * an optional incoming state with the on-node interactive state.
 */

import type { NodeExecutorFn, ExecutionContext } from '../ExecutionEngine'
import {
  fromWebGamepad,
  anyButtonPressed,
  emptyControllerState,
  LOGICAL_BUTTONS,
  type ControllerState,
} from '@/services/input/controllerState'

interface GamepadNodeState {
  prevAnyButton: boolean
}

const gamepadState = new Map<string, GamepadNodeState>()

function readGamepads(): (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return []
  try {
    return Array.from(navigator.getGamepads())
  } catch {
    return []
  }
}

export const gamepadExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const padSel = (ctx.controls.get('pad') as string) ?? 'auto'
  const deadzone = (ctx.controls.get('deadzone') as number) ?? 0.08
  const pads = readGamepads()

  let gp: Gamepad | null = null
  if (padSel === 'auto') {
    gp = pads.find((p): p is Gamepad => !!p && p.connected) ?? null
  } else {
    gp = pads[Number(padSel)] ?? null
  }

  const state = fromWebGamepad(gp, deadzone)

  // Rising-edge "any button" trigger.
  let node = gamepadState.get(ctx.nodeId)
  if (!node) {
    node = { prevAnyButton: false }
    gamepadState.set(ctx.nodeId, node)
  }
  const pressed = anyButtonPressed(state)
  const trigger = pressed && !node.prevAnyButton
  node.prevAnyButton = pressed

  const outputs = new Map<string, unknown>()
  outputs.set('state', state)
  outputs.set('connected', state.connected)
  if (trigger) outputs.set('anyButton', 1)
  return outputs
}

/**
 * Merge two ControllerStates: buttons take the max (so an incoming press OR a
 * touch press both register), axes prefer whichever has the larger magnitude.
 */
function mergeStates(base: ControllerState, overlay: ControllerState | null): ControllerState {
  if (!overlay) return base
  const out = emptyControllerState()
  out.connected = base.connected || overlay.connected
  out.id = base.id ?? overlay.id
  for (const b of LOGICAL_BUTTONS) {
    out.buttons[b] = Math.max(base.buttons[b] ?? 0, overlay.buttons[b] ?? 0)
  }
  for (const a of ['lx', 'ly', 'rx', 'ry'] as const) {
    const bv = base.axes[a] ?? 0
    const ov = overlay.axes[a] ?? 0
    out.axes[a] = Math.abs(ov) >= Math.abs(bv) ? ov : bv
  }
  return out
}

export const gamepadVisualExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Incoming state to visualize (optional) merged with the node's interactive
  // (touch/click) state, which the component writes to node.data.interactive.
  const input = (ctx.inputs.get('state') as ControllerState | undefined) ?? null
  const interactive = (ctx.controls.get('interactive') as ControllerState | undefined) ?? null

  const base = input ?? emptyControllerState()
  if (input) base.connected = true
  const merged = mergeStates(base, interactive)

  const outputs = new Map<string, unknown>()
  outputs.set('state', merged)
  outputs.set('connected', merged.connected)
  return outputs
}

export function gcGamepadState(validNodeIds: Set<string>): void {
  for (const id of gamepadState.keys()) {
    if (!validNodeIds.has(id)) gamepadState.delete(id)
  }
}

export function disposeAllGamepadState(): void {
  gamepadState.clear()
}
