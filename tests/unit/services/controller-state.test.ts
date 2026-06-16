import { describe, it, expect } from 'vitest'
import {
  emptyControllerState,
  applyDeadzone,
  fromWebGamepad,
  anyButtonPressed,
  STANDARD_BUTTON_TO_LOGICAL,
  LOGICAL_BUTTONS,
} from '@/services/input/controllerState'

// Minimal fake of a Web Gamepad API Gamepad.
function fakeGamepad(opts: {
  pressedIndices?: number[]
  buttonValues?: Record<number, number>
  axes?: number[]
  connected?: boolean
  id?: string
}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const value = opts.buttonValues?.[i] ?? (opts.pressedIndices?.includes(i) ? 1 : 0)
    return { pressed: value > 0, touched: value > 0, value } as GamepadButton
  })
  return {
    id: opts.id ?? 'Test Pad (STANDARD GAMEPAD)',
    index: 0,
    connected: opts.connected ?? true,
    mapping: 'standard',
    timestamp: 0,
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  } as unknown as Gamepad
}

describe('controllerState', () => {
  it('emptyControllerState has every logical button at 0 and disconnected', () => {
    const s = emptyControllerState()
    expect(s.connected).toBe(false)
    for (const b of LOGICAL_BUTTONS) expect(s.buttons[b]).toBe(0)
    expect(s.axes).toEqual({ lx: 0, ly: 0, rx: 0, ry: 0 })
  })

  it('STANDARD_BUTTON_TO_LOGICAL covers all 17 standard buttons', () => {
    expect(Object.keys(STANDARD_BUTTON_TO_LOGICAL)).toHaveLength(17)
    expect(STANDARD_BUTTON_TO_LOGICAL[0]).toBe('a')
    expect(STANDARD_BUTTON_TO_LOGICAL[12]).toBe('up')
    expect(STANDARD_BUTTON_TO_LOGICAL[16]).toBe('home')
  })

  describe('applyDeadzone', () => {
    it('zeros values inside the deadzone', () => {
      expect(applyDeadzone(0.05, 0.1)).toBe(0)
      expect(applyDeadzone(-0.1, 0.1)).toBe(0)
    })
    it('rescales so full deflection still reaches ±1 and preserves sign', () => {
      expect(applyDeadzone(1, 0.1)).toBeCloseTo(1)
      expect(applyDeadzone(-1, 0.1)).toBeCloseTo(-1)
      expect(applyDeadzone(0.55, 0.1)).toBeCloseTo((0.55 - 0.1) / 0.9)
    })
    it('clamps to ±1 and tolerates extreme deadzones', () => {
      expect(applyDeadzone(2, 0.1)).toBe(1)
      expect(applyDeadzone(0.5, 5)).toBe(0)
    })
  })

  describe('fromWebGamepad', () => {
    it('returns a disconnected empty state for null', () => {
      expect(fromWebGamepad(null)).toEqual(emptyControllerState())
    })
    it('maps standard button indices to logical ids', () => {
      const s = fromWebGamepad(fakeGamepad({ pressedIndices: [0, 9, 12] }))
      expect(s.connected).toBe(true)
      expect(s.buttons.a).toBe(1) // index 0
      expect(s.buttons.start).toBe(1) // index 9
      expect(s.buttons.up).toBe(1) // index 12
      expect(s.buttons.b).toBe(0)
    })
    it('passes through analog trigger values', () => {
      const s = fromWebGamepad(fakeGamepad({ buttonValues: { 6: 0.42 } }))
      expect(s.buttons.l2).toBeCloseTo(0.42)
    })
    it('applies the deadzone to axes', () => {
      const s = fromWebGamepad(fakeGamepad({ axes: [0.05, 1, -1, 0] }), 0.1)
      expect(s.axes.lx).toBe(0) // inside deadzone
      expect(s.axes.ly).toBeCloseTo(1)
      expect(s.axes.rx).toBeCloseTo(-1)
    })
    it('carries the device id', () => {
      expect(fromWebGamepad(fakeGamepad({ id: 'Xbox Wireless' })).id).toBe('Xbox Wireless')
    })
  })

  describe('anyButtonPressed', () => {
    it('detects a press past the threshold', () => {
      expect(anyButtonPressed(emptyControllerState())).toBe(false)
      expect(anyButtonPressed(fromWebGamepad(fakeGamepad({ pressedIndices: [3] })))).toBe(true)
    })
  })
})
