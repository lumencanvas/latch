/**
 * ControllerState — the unified, self-describing controller format shared by the
 * Gamepad node, the Visual Gamepad node, CLASP, and the Emulator node's controller
 * inlets. It mirrors the W3C Standard Gamepad layout with named logical controls so
 * it's readable on the wire and CLASP-addressable (e.g. /p1/buttons/a, /p1/axes/lx).
 *
 * - button values are 0..1 (digital = 0 or 1; analog triggers fractional)
 * - axis values are -1..1
 */

export interface ControllerButtons {
  a: number
  b: number
  x: number
  y: number
  l1: number
  r1: number
  l2: number
  r2: number
  select: number
  start: number
  l3: number
  r3: number
  up: number
  down: number
  left: number
  right: number
  home: number
}

export interface ControllerAxes {
  lx: number
  ly: number
  rx: number
  ry: number
}

export interface ControllerState {
  connected: boolean
  id?: string
  buttons: ControllerButtons
  axes: ControllerAxes
}

export type LogicalButton = keyof ControllerButtons

/** All logical button ids, in Standard-Gamepad order. */
export const LOGICAL_BUTTONS: LogicalButton[] = [
  'a', 'b', 'x', 'y',
  'l1', 'r1', 'l2', 'r2',
  'select', 'start', 'l3', 'r3',
  'up', 'down', 'left', 'right',
  'home',
]

/** W3C Standard Gamepad button index → logical button id. */
export const STANDARD_BUTTON_TO_LOGICAL: Record<number, LogicalButton> = {
  0: 'a', 1: 'b', 2: 'x', 3: 'y',
  4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2',
  8: 'select', 9: 'start', 10: 'l3', 11: 'r3',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
  16: 'home',
}

export function emptyControllerState(): ControllerState {
  return {
    connected: false,
    buttons: {
      a: 0, b: 0, x: 0, y: 0,
      l1: 0, r1: 0, l2: 0, r2: 0,
      select: 0, start: 0, l3: 0, r3: 0,
      up: 0, down: 0, left: 0, right: 0,
      home: 0,
    },
    axes: { lx: 0, ly: 0, rx: 0, ry: 0 },
  }
}

/**
 * Apply a per-axis deadzone, rescaling the remaining range so the stick still
 * reaches ±1 at full deflection (avoids a dead band that clips the top end).
 */
export function applyDeadzone(value: number, deadzone: number): number {
  const dz = Math.max(0, Math.min(0.99, deadzone))
  const mag = Math.abs(value)
  if (mag <= dz) return 0
  const scaled = (mag - dz) / (1 - dz)
  return Math.sign(value) * Math.min(1, scaled)
}

/** Build a ControllerState from a Web Gamepad API snapshot (null → disconnected). */
export function fromWebGamepad(gp: Gamepad | null | undefined, deadzone = 0): ControllerState {
  const state = emptyControllerState()
  if (!gp) return state
  state.connected = gp.connected
  state.id = gp.id
  for (const [idxStr, logical] of Object.entries(STANDARD_BUTTON_TO_LOGICAL)) {
    const btn = gp.buttons[Number(idxStr)]
    if (btn) {
      state.buttons[logical] = typeof btn.value === 'number' ? btn.value : (btn.pressed ? 1 : 0)
    }
  }
  state.axes.lx = applyDeadzone(gp.axes[0] ?? 0, deadzone)
  state.axes.ly = applyDeadzone(gp.axes[1] ?? 0, deadzone)
  state.axes.rx = applyDeadzone(gp.axes[2] ?? 0, deadzone)
  state.axes.ry = applyDeadzone(gp.axes[3] ?? 0, deadzone)
  return state
}

/** True if any button is pressed past a small threshold (for an "any button" edge). */
export function anyButtonPressed(state: ControllerState, threshold = 0.5): boolean {
  for (const b of LOGICAL_BUTTONS) {
    if (state.buttons[b] >= threshold) return true
  }
  return false
}
