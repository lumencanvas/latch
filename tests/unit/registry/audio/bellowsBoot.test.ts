import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Drives the REAL getBellows() boot path (not a seam) with a controllable Bellows.boot, to pin
// the Stop→Play-during-boot race: a boot overtaken by a disposal must dispose its own kernel,
// never be installed, and never voice the record created by the next Play.

class FakeBaseAudioContext {}
const nativeCtx = new FakeBaseAudioContext()

const boots: { resolve: (b: unknown) => void; kernel: ReturnType<typeof makeKernel> }[] = []

function makeKernel() {
  const created: { engine: string; params: unknown; inst: Record<string, ReturnType<typeof vi.fn>> }[] = []
  return {
    created,
    analyser: { disconnect: vi.fn(), connect: vi.fn() },
    voice: vi.fn((engine: string, params: unknown) => {
      const inst = {
        note: vi.fn(), on: vi.fn(() => 1), off: vi.fn(), param: vi.fn(), rampParam: vi.fn(),
        fx: vi.fn(), fxParam: vi.fn(), send: vi.fn(), gain: vi.fn(), pan: vi.fn(), dispose: vi.fn(),
      }
      created.push({ engine, params, inst })
      return inst
    }),
    bus: vi.fn(() => ({ id: 1 })),
    dispose: vi.fn(),
  }
}

vi.mock('@/services/audio/AudioManager', () => ({
  audioManager: {
    initialize: vi.fn(async () => {}),
    getMasterOutput: vi.fn(() => ({})),
  },
  Tone: {
    getContext: () => ({ rawContext: nativeCtx }),
    connect: vi.fn(),
    // Master keep-alive (see bellowsManager `masterKeepAlive`).
    Signal: class {
      static live = 0
      static made = 0
      constructor() { (this.constructor as { made: number; live: number }).made++; (this.constructor as { live: number }).live++ }
      connect() { return this }
      dispose() { (this.constructor as { live: number }).live-- }
    },
  },
}))

vi.mock('bellowsjs', () => ({
  Bellows: {
    boot: vi.fn(() => new Promise((resolve) => {
      boots.push({ resolve, kernel: makeKernel() })
    })),
  },
  getPreset: (id: string) => {
    if (id === 'cello') return { id, engineId: 'string', params: { damp: 0.4 }, fx: [] }
    throw new Error('unknown')
  },
  listEngines: () => [],
}))

import {
  configureVoice,
  queueNote,
  __resetBellowsForTest,
  __disposeAllForTest,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import type { VoiceConfig } from '@/registry/audio/bellows-instrument/engineParams'

const cfg = (over: Partial<VoiceConfig> = {}): VoiceConfig => ({
  preset: '', engine: 'va', params: {}, insertFx: null, fxParams: {}, send: 0, gain: 0.8, pan: 0, ...over,
})

/** Let queued microtasks / the dynamic import settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  Object.assign(globalThis, { BaseAudioContext: FakeBaseAudioContext })
  boots.length = 0
  __resetBellowsForTest()
})
afterEach(() => {
  delete (globalThis as Record<string, unknown>).BaseAudioContext
})

describe('bellows kernel boot', () => {
  it('voices a preset node directly on the preset engine and replays one-shots queued during boot', async () => {
    configureVoice('n', cfg({ preset: 'cello' }))
    queueNote('n', 60, 0.5)
    await settle()
    expect(boots).toHaveLength(1)
    const { resolve, kernel } = boots[0]
    resolve(kernel)
    await settle()
    expect(kernel.voice).toHaveBeenCalledTimes(1) // no throwaway 'va' channel
    expect(kernel.voice).toHaveBeenCalledWith('string', { damp: 0.4 })
    expect(kernel.created[0].inst.note).toHaveBeenCalledWith(60, { dur: '8n', vel: 0.5 })
    expect(kernel.analyser.disconnect).toHaveBeenCalled() // rerouted into LATCH master
  })

  it('Stop→Play during an in-flight boot: the stale kernel disposes itself and is never used', async () => {
    configureVoice('n', cfg())
    await settle()
    expect(boots).toHaveLength(1)

    __disposeAllForTest() // Stop while boot #1 is still in flight
    configureVoice('n', cfg({ engine: 'fm' })) // Play again: a new record + boot #2
    await settle()
    expect(boots).toHaveLength(2)

    const stale = boots[0]
    stale.resolve(stale.kernel)
    await settle()
    expect(stale.kernel.dispose).toHaveBeenCalledTimes(1) // orphan cleaned up
    expect(stale.kernel.voice).not.toHaveBeenCalled() // never voiced the new record

    const fresh = boots[1]
    fresh.resolve(fresh.kernel)
    await settle()
    expect(fresh.kernel.dispose).not.toHaveBeenCalled()
    expect(fresh.kernel.voice).toHaveBeenCalledWith('fm', {})
  })
})

describe('bellows master keep-alive (silent bellows-only flows)', () => {
  it('parks one silent Tone source on master per kernel and releases it with the kernel', async () => {
    const { Tone } = await import('@/services/audio/AudioManager')
    const Sig = (Tone as unknown as { Signal: { live: number; made: number } }).Signal
    const before = Sig.made
    configureVoice('k', cfg())
    await settle()
    boots[0].resolve(boots[0].kernel)
    await settle()
    // Tone's standardized-audio-context keeps master unplugged from the speakers unless it
    // sees an active input; bellows feeds master natively, so without this it was silent.
    expect(Sig.made - before).toBe(1)
    expect(Sig.live).toBe(1)
    __disposeAllForTest()
    expect(Sig.live).toBe(0)
  })
})
