import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gamepadExecutor, gamepadVisualExecutor, disposeAllGamepadState } from '@/engine/executors/gamepad'
import { emptyControllerState, type ControllerState } from '@/services/input/controllerState'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 1,
  }
}

function fakeGamepad(index: number, pressedIndices: number[] = [], connected = true): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const value = pressedIndices.includes(i) ? 1 : 0
    return { pressed: value > 0, touched: value > 0, value } as GamepadButton
  })
  return { id: `Pad ${index}`, index, connected, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad
}

function setPads(pads: (Gamepad | null)[]) {
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true })
}

describe('gamepadExecutor', () => {
  beforeEach(() => {
    disposeAllGamepadState()
    setPads([])
  })
  afterEach(() => disposeAllGamepadState())

  it('outputs a disconnected empty state when no pad is present', () => {
    const out = gamepadExecutor(ctx('g', {}, { pad: 'auto', deadzone: 0 })) as Map<string, unknown>
    expect(out.get('connected')).toBe(false)
    expect((out.get('state') as ControllerState).buttons.a).toBe(0)
  })

  it('reads the first connected pad in auto mode and maps buttons', () => {
    setPads([null, fakeGamepad(1, [0, 9])])
    const out = gamepadExecutor(ctx('g', {}, { pad: 'auto', deadzone: 0 })) as Map<string, unknown>
    expect(out.get('connected')).toBe(true)
    const state = out.get('state') as ControllerState
    expect(state.buttons.a).toBe(1) // index 0
    expect(state.buttons.start).toBe(1) // index 9
  })

  it('selects a specific pad slot', () => {
    setPads([fakeGamepad(0, [1]), fakeGamepad(1, [3])])
    const out = gamepadExecutor(ctx('g', {}, { pad: '1', deadzone: 0 })) as Map<string, unknown>
    const state = out.get('state') as ControllerState
    expect(state.buttons.y).toBe(1) // pad 1 has index 3 (y)
    expect(state.buttons.b).toBe(0) // pad 0's index 1 not read
  })

  it('emits anyButton only on the rising edge', () => {
    setPads([fakeGamepad(0, [2])])
    const first = gamepadExecutor(ctx('g', {}, { pad: 'auto' })) as Map<string, unknown>
    expect(first.get('anyButton')).toBe(1) // fires
    const second = gamepadExecutor(ctx('g', {}, { pad: 'auto' })) as Map<string, unknown>
    expect(second.get('anyButton')).toBeUndefined() // still held → no re-fire
    setPads([fakeGamepad(0, [])]) // released
    const third = gamepadExecutor(ctx('g', {}, { pad: 'auto' })) as Map<string, unknown>
    expect(third.get('anyButton')).toBeUndefined()
    setPads([fakeGamepad(0, [2])]) // pressed again
    const fourth = gamepadExecutor(ctx('g', {}, { pad: 'auto' })) as Map<string, unknown>
    expect(fourth.get('anyButton')).toBe(1) // re-fires
  })
})

describe('gamepadVisualExecutor', () => {
  it('passes through the wired input state', () => {
    const input = emptyControllerState()
    input.buttons.x = 1
    const out = gamepadVisualExecutor(ctx('v', { state: input })) as Map<string, unknown>
    const state = out.get('state') as ControllerState
    expect(state.buttons.x).toBe(1)
    expect(out.get('connected')).toBe(true)
  })

  it('merges interactive (touch) state with the input via max', () => {
    const input = emptyControllerState()
    input.buttons.a = 1
    const interactive = emptyControllerState()
    interactive.buttons.b = 1
    const out = gamepadVisualExecutor(ctx('v', { state: input }, { interactive })) as Map<string, unknown>
    const state = out.get('state') as ControllerState
    expect(state.buttons.a).toBe(1) // from input
    expect(state.buttons.b).toBe(1) // from interactive
  })
})
