import { describe, it, expect } from 'vitest'
import {
  EMU_CORES,
  coreSpec,
  detectCoreFromFilename,
  controllerStateToEmuInputs,
  emuIndexForLogical,
  ANALOG_FULL,
} from '@/services/emulation/coreMap'
import { emptyControllerState, type ControllerState } from '@/services/input/controllerState'

function state(mut: (s: ControllerState) => void): ControllerState {
  const s = emptyControllerState()
  s.connected = true
  mut(s)
  return s
}

describe('coreMap — detection + specs', () => {
  it('detects cores from ROM extensions (with query strings)', () => {
    expect(detectCoreFromFilename('SuperMario.nes')).toBe('nes')
    expect(detectCoreFromFilename('zelda.z64')).toBe('n64')
    expect(detectCoreFromFilename('game.sfc')).toBe('snes')
    expect(detectCoreFromFilename('disc.cue?token=1')).toBe('psx')
    expect(detectCoreFromFilename('readme.txt')).toBeNull()
  })

  it('coreSpec falls back to NES for unknown keys', () => {
    expect(coreSpec('n64').key).toBe('n64')
    expect(coreSpec('nope').key).toBe('nes')
    expect(coreSpec(null).key).toBe('nes')
  })

  it('reports the right max player counts', () => {
    expect(EMU_CORES.nes.maxPlayers).toBe(2)
    expect(EMU_CORES.n64.maxPlayers).toBe(4)
    expect(EMU_CORES.gb.maxPlayers).toBe(1)
  })
})

describe('coreMap — controllerStateToEmuInputs', () => {
  it('maps NES digital buttons to the right EmulatorJS indices', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.nes, state((s) => { s.buttons.a = 1; s.buttons.b = 1 }))
    expect(out.get(8)).toBe(1) // A → index 8
    expect(out.get(0)).toBe(1) // B → index 0
    expect(out.get(3)).toBe(0) // start not pressed
  })

  it('maps an NES dpad press via the left stick (dpad mode), Y negated', () => {
    // Web Gamepad ly = -1 means stick up.
    const out = controllerStateToEmuInputs(EMU_CORES.nes, state((s) => { s.axes.ly = -1 }))
    expect(out.get(4)).toBe(1) // up
    expect(out.get(5) ?? 0).toBe(0) // down
  })

  it('sends N64 left stick as full-scale analog on indices 16-19', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.n64, state((s) => { s.axes.lx = 1; s.axes.ly = -1 }))
    expect(out.get(16)).toBe(ANALOG_FULL) // right
    expect(out.get(19)).toBe(ANALOG_FULL) // up (ly negated)
    expect(out.get(17)).toBe(0)
  })

  it('sends N64 C-buttons (right stick) at full-scale on indices 20-23', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.n64, state((s) => { s.axes.rx = 1 }))
    // cRight touchIndex = 20; a digital control on an analog index sends full-scale.
    expect(out.get(20)).toBe(ANALOG_FULL)
  })

  it('maps L1/L2 through the alias layer (N64 l2 → Z at index 12)', () => {
    expect(emuIndexForLogical(EMU_CORES.n64, 'l2')).toBe(12)
    expect(emuIndexForLogical(EMU_CORES.snes, 'l1')).toBe(10) // l1 → l → 10
    const out = controllerStateToEmuInputs(EMU_CORES.n64, state((s) => { s.buttons.l2 = 1 }))
    expect(out.get(12)).toBe(1)
  })

  it('maps PSX face + right stick (analog2 on 20-23)', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.psx, state((s) => { s.buttons.a = 1; s.axes.rx = 1 }))
    expect(out.get(0)).toBe(1) // a → cross → 0
    expect(out.get(20)).toBe(ANALOG_FULL) // right stick right
  })

  it('maps Genesis 6-button (l1→Z, r1→C)', () => {
    expect(emuIndexForLogical(EMU_CORES.genesis, 'a')).toBe(1)
    expect(emuIndexForLogical(EMU_CORES.genesis, 'b')).toBe(0)
    expect(emuIndexForLogical(EMU_CORES.genesis, 'l1')).toBe(11) // l → Z
    expect(emuIndexForLogical(EMU_CORES.genesis, 'r1')).toBe(8) // r → C
  })

  it('maps GBA shoulder buttons (l1→L, r1→R)', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.gba, state((s) => { s.buttons.l1 = 1; s.buttons.r1 = 1; s.buttons.a = 1 }))
    expect(out.get(10)).toBe(1) // L
    expect(out.get(11)).toBe(1) // R
    expect(out.get(8)).toBe(1) // a → A → 8
  })

  it('maps Atari start→reset and a→fire', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.atari2600, state((s) => { s.buttons.a = 1; s.buttons.start = 1 }))
    expect(out.get(0)).toBe(1) // fire
    expect(out.get(3)).toBe(1) // start → reset → 3
  })

  it('on dpad cores the analog left stick acts as the d-pad', () => {
    // SNES has no analog stick; pushing the stick right should press d-pad right (idx 7).
    const out = controllerStateToEmuInputs(EMU_CORES.snes, state((s) => { s.axes.lx = 1 }))
    expect(out.get(7)).toBe(1)
    expect(out.get(16) ?? 0).toBe(0) // not sent as an analog axis
  })

  it('leaves unmapped logical buttons (l3/r3/home) out entirely', () => {
    const out = controllerStateToEmuInputs(EMU_CORES.snes, state((s) => { s.buttons.l3 = 1; s.buttons.home = 1 }))
    // Nothing pressed maps to an index; the map only holds the (zero) digital buttons.
    expect([...out.values()].every((v) => v === 0)).toBe(true)
  })
})
