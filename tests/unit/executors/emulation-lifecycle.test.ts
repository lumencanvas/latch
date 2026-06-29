/**
 * Emulation lifecycle (defineLifecycle conversion).
 *
 * emulation's cleanup is ASYMMETRIC and so does NOT fit `defineNodeState` (whose
 * `disposeAll()` always clears the map):
 *   - gc / node removal  → tear down resources, remove host, DROP the registration
 *   - disposeAll / stop  → tear down resources, KEEP the registration (so a node
 *                          survives flow stop→restart; clearing it once orphaned nodes)
 * It is registered via `defineLifecycle` (plain map + its existing gc/disposeAll), so
 * the engine's generic loop drives it without the old hand-wired calls. These are also
 * emulation's first tests. An un-booted entry has no texture/audio, so no WebGL/Tone
 * is touched here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectedLifecycles } from '@/engine/nodeState'
import {
  registerEmulatorNode,
  gcEmulationState,
  disposeAllEmulationNodes,
  getEmulatorLoader,
  type EmulatorControls,
} from '@/engine/executors/emulation'

function mockControls(): { controls: EmulatorControls; teardown: ReturnType<typeof vi.fn> } {
  const teardown = vi.fn()
  const loader = { teardown, getHost: () => null } as unknown as EmulatorControls['loader']
  return {
    controls: { loader, getCoreKey: () => 'nes', onStart: vi.fn(), onStop: vi.fn(), onReset: vi.fn() },
    teardown,
  }
}

describe('emulation lifecycle (defineLifecycle)', () => {
  beforeEach(() => gcEmulationState(new Set())) // clear all entries (gc deletes; disposeAll wouldn't)

  it('self-registers its gc + disposeAll into the engine lifecycle loop', () => {
    expect(collectedLifecycles().some((l) => l.label === 'emulation')).toBe(true)
  })

  it('gc / node removal tears down the emulator and drops the registration', () => {
    const { controls, teardown } = mockControls()
    registerEmulatorNode('n1', controls)
    expect(getEmulatorLoader('n1')).toBe(controls.loader)

    gcEmulationState(new Set()) // 'n1' not in the valid set → removed

    expect(teardown).toHaveBeenCalledTimes(1)
    expect(getEmulatorLoader('n1')).toBeUndefined()
  })

  it('disposeAll (flow stop) tears down resources but KEEPS the registration', () => {
    const { controls, teardown } = mockControls()
    registerEmulatorNode('n1', controls)

    disposeAllEmulationNodes()

    expect(teardown).toHaveBeenCalledTimes(1) // resources freed
    expect(getEmulatorLoader('n1')).toBe(controls.loader) // registration kept — the asymmetry
  })
})
