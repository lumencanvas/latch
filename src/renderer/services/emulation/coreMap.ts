/**
 * Per-core controller mapping for the EmulatorJS node.
 *
 * Turns the unified ControllerState (Standard-Gamepad logical names) into the
 * exact EmulatorJS `simulateInput(player, index, value)` index/value pairs each
 * libretro core expects. Two tables per core keep it faithful to EmulatorJS's
 * RetroPad layout (adapted from the doot-games retro-arcade rules):
 *  - `padAlias`:   Standard-Gamepad position id -> the core's touch id
 *  - `touchIndex`: the core's touch id -> EmulatorJS simulateInput index
 *
 * Pure module (no DOM / EmulatorJS) so the whole mapping is unit-testable.
 */

import type { ControllerState, LogicalButton } from '@/services/input/controllerState'

/** Value EmulatorJS expects for a fully-deflected analog axis. */
export const ANALOG_FULL = 0x7fff

/**
 * simulateInput indices that are analog axes (16-19 left stick, 20-23 right
 * stick). A digital control bound to one of these (e.g. the N64 C-buttons at
 * 20-23) must send full-scale on press, not 1.
 */
export const ANALOG_INDICES = new Set([16, 17, 18, 19, 20, 21, 22, 23])

export type LeftStickRole = 'analog' | 'dpad'
export type RightStickRole = 'analog2' | 'cbtns' | null

export interface EmuCoreSpec {
  key: string
  /** EmulatorJS core name passed to EJS_core. */
  core: string
  label: string
  /** Max simultaneous controllers (drives the number of inlets). */
  maxPlayers: number
  /** ROM file extensions that map to this core. */
  extensions: string[]
  leftStick: LeftStickRole
  rightStick: RightStickRole
  /** Cores that benefit from threads when the page is cross-origin isolated. */
  threaded?: boolean
  touchIndex: Record<string, number>
  padAlias: Record<string, string>
}

const UP = 4, DOWN = 5, LEFT = 6, RIGHT = 7
const DIRS = { up: UP, down: DOWN, left: LEFT, right: RIGHT }
const PAD_DIRS = { up: 'up', down: 'down', left: 'left', right: 'right' }
export const CBTN_BY_DIR = { up: 'cUp', down: 'cDown', left: 'cLeft', right: 'cRight' } as const

/** Our ControllerState logical button -> the Standard-Gamepad id used in padAlias. */
const STD_FROM_LOGICAL: Partial<Record<LogicalButton, string>> = {
  a: 'a', b: 'b', x: 'x', y: 'y',
  l1: 'l', r1: 'r', l2: 'l2', r2: 'r2',
  select: 'select', start: 'start',
  up: 'up', down: 'down', left: 'left', right: 'right',
}

export const EMU_CORES: Record<string, EmuCoreSpec> = {
  nes: {
    key: 'nes', core: 'nes', label: 'NES', maxPlayers: 2, extensions: ['nes', 'fds'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  snes: {
    key: 'snes', core: 'snes', label: 'SNES', maxPlayers: 2, extensions: ['sfc', 'smc', 'swc', 'fig'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, y: 1, select: 2, start: 3, a: 8, x: 9, l: 10, r: 11, ...DIRS },
    padAlias: { a: 'a', b: 'b', x: 'x', y: 'y', l: 'l', r: 'r', select: 'select', start: 'start', ...PAD_DIRS },
  },
  n64: {
    key: 'n64', core: 'n64', label: 'N64', maxPlayers: 4, extensions: ['n64', 'z64', 'v64'],
    leftStick: 'analog', rightStick: 'cbtns', threaded: true,
    touchIndex: { a: 0, b: 1, start: 3, l: 10, r: 11, z: 12, cRight: 20, cLeft: 21, cDown: 22, cUp: 23, ...DIRS },
    padAlias: { a: 'a', b: 'b', l: 'l', r: 'r', l2: 'z', start: 'start', ...PAD_DIRS },
  },
  gb: {
    key: 'gb', core: 'gb', label: 'Game Boy', maxPlayers: 1, extensions: ['gb', 'sgb'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  gbc: {
    key: 'gbc', core: 'gbc', label: 'Game Boy Color', maxPlayers: 1, extensions: ['gbc'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'a', b: 'b', select: 'select', start: 'start', ...PAD_DIRS },
  },
  gba: {
    key: 'gba', core: 'gba', label: 'GBA', maxPlayers: 1, extensions: ['gba'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, a: 8, select: 2, start: 3, l: 10, r: 11, ...DIRS },
    padAlias: { a: 'a', b: 'b', l: 'l', r: 'r', select: 'select', start: 'start', ...PAD_DIRS },
  },
  genesis: {
    key: 'genesis', core: 'segaMD', label: 'Genesis', maxPlayers: 2, extensions: ['md', 'gen', 'smd'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b: 0, a: 1, select: 2, start: 3, c: 8, y: 9, x: 10, z: 11, ...DIRS },
    padAlias: { a: 'a', b: 'b', x: 'x', y: 'y', l: 'z', r: 'c', select: 'select', start: 'start', ...PAD_DIRS },
  },
  sms: {
    key: 'sms', core: 'segaMS', label: 'Master System', maxPlayers: 2, extensions: ['sms', 'gg'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { b1: 0, b2: 8, ...DIRS },
    padAlias: { a: 'b1', b: 'b2', ...PAD_DIRS },
  },
  psx: {
    key: 'psx', core: 'psx', label: 'PlayStation', maxPlayers: 2, extensions: ['iso', 'cue', 'pbp', 'chd'],
    leftStick: 'analog', rightStick: 'analog2', threaded: true,
    touchIndex: { cross: 0, square: 1, select: 2, start: 3, circle: 8, triangle: 9, l: 10, r: 11, l2: 12, r2: 13, ...DIRS },
    padAlias: { a: 'cross', b: 'circle', x: 'square', y: 'triangle', l: 'l', r: 'r', l2: 'l2', r2: 'r2', select: 'select', start: 'start', ...PAD_DIRS },
  },
  pce: {
    key: 'pce', core: 'pce', label: 'PC Engine', maxPlayers: 2, extensions: ['pce'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { two: 0, one: 8, select: 2, start: 3, ...DIRS },
    padAlias: { a: 'one', b: 'two', select: 'select', start: 'start', ...PAD_DIRS },
  },
  atari2600: {
    key: 'atari2600', core: 'atari2600', label: 'Atari 2600', maxPlayers: 2, extensions: ['a26'],
    leftStick: 'dpad', rightStick: null,
    touchIndex: { fire: 0, select: 2, reset: 3, ...DIRS },
    padAlias: { a: 'fire', select: 'select', start: 'reset', ...PAD_DIRS },
  },
}

export const CORE_LIST: EmuCoreSpec[] = Object.values(EMU_CORES)

export function coreSpec(key: string | null | undefined): EmuCoreSpec {
  return (key && EMU_CORES[key]) || EMU_CORES.nes
}

const EXT_TO_CORE: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const spec of CORE_LIST) for (const ext of spec.extensions) map[ext] = spec.key
  return map
})()

/** Detect a core key from a ROM filename/URL by extension, or null. */
export function detectCoreFromFilename(nameOrUrl: string): string | null {
  const clean = nameOrUrl.split(/[?#]/)[0] ?? nameOrUrl
  const ext = (clean.split('.').pop() ?? '').toLowerCase()
  return EXT_TO_CORE[ext] ?? null
}

/** simulateInput value for a digital press: full-scale for analog-axis indices, else 1. */
export function simValueFor(index: number, pressed: boolean): number {
  if (!pressed) return 0
  return ANALOG_INDICES.has(index) ? ANALOG_FULL : 1
}

/** Active directions for a screen-up-positive analog sample past a threshold. */
export function axisToDirections(x: number, y: number, threshold = 0.5) {
  return { up: y > threshold, down: y < -threshold, left: x < -threshold, right: x > threshold }
}

/**
 * Split a screen-up-positive analog sample into the four EmulatorJS axis indices
 * from `base` (16 left stick, 20 right stick): base+0 right, +1 left, +2 down,
 * +3 up, as signed full-scale magnitudes.
 */
export function analogToEmu(x: number, y: number, base: number): Array<[number, number]> {
  const m = ANALOG_FULL
  return [
    [base + 0, x > 0 ? Math.round(m * x) : 0],
    [base + 1, x < 0 ? Math.round(-m * x) : 0],
    [base + 2, y < 0 ? Math.round(-m * y) : 0],
    [base + 3, y > 0 ? Math.round(m * y) : 0],
  ]
}

/** Resolve one logical button to the core's EmulatorJS index, or null if unmapped. */
export function emuIndexForLogical(spec: EmuCoreSpec, logical: LogicalButton): number | null {
  const pos = STD_FROM_LOGICAL[logical]
  if (!pos) return null
  const touchId = spec.padAlias[pos]
  if (!touchId) return null
  const idx = spec.touchIndex[touchId]
  return idx == null ? null : idx
}

const DIGITAL_BUTTONS: LogicalButton[] = [
  'a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'up', 'down', 'left', 'right',
]

/**
 * Map a full ControllerState to EmulatorJS `simulateInput` index -> value pairs for
 * one core. Note: Web Gamepad Y axes are down-positive, so they're negated to the
 * screen-up-positive convention EmulatorJS expects. Pure → unit-tested.
 */
export function controllerStateToEmuInputs(spec: EmuCoreSpec, state: ControllerState): Map<number, number> {
  const out = new Map<number, number>()
  const setMax = (idx: number, val: number) => out.set(idx, Math.max(out.get(idx) ?? 0, val))

  for (const logical of DIGITAL_BUTTONS) {
    const idx = emuIndexForLogical(spec, logical)
    if (idx == null) continue
    const pressed = (state.buttons[logical] ?? 0) > 0.5
    setMax(idx, simValueFor(idx, pressed))
  }

  const lx = state.axes.lx ?? 0
  const lyUp = -(state.axes.ly ?? 0)
  if (spec.leftStick === 'analog') {
    for (const [idx, val] of analogToEmu(lx, lyUp, 16)) setMax(idx, val)
  } else {
    const d = axisToDirections(lx, lyUp)
    if (d.up) setMax(UP, 1)
    if (d.down) setMax(DOWN, 1)
    if (d.left) setMax(LEFT, 1)
    if (d.right) setMax(RIGHT, 1)
  }

  const rx = state.axes.rx ?? 0
  const ryUp = -(state.axes.ry ?? 0)
  if (spec.rightStick === 'analog2') {
    for (const [idx, val] of analogToEmu(rx, ryUp, 20)) setMax(idx, val)
  } else if (spec.rightStick === 'cbtns') {
    const d = axisToDirections(rx, ryUp)
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      if (!d[dir]) continue
      const idx = spec.touchIndex[CBTN_BY_DIR[dir]]
      if (idx != null) setMax(idx, simValueFor(idx, true))
    }
  }

  return out
}
