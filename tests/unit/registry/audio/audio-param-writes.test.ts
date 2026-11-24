import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// Fake Tone nodes that count writes / triggers (happy-dom has no real AudioContext graph).
const { envs, gains, players } = vi.hoisted(() => ({
  envs: [] as Array<{ triggerAttack: ReturnType<typeof vi.fn>; triggerRelease: ReturnType<typeof vi.fn> }>,
  gains: [] as Array<{ writes: number[]; disposed: boolean }>,
  players: [] as Array<{
    loaded: boolean
    start: ReturnType<typeof vi.fn>
    opts: { onerror: (e: Error) => void }
  }>,
}))

vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  class FakeEnvelope {
    attack = 0
    decay = 0
    sustain = 0
    release = 0
    value = 0
    triggerAttack = vi.fn()
    triggerRelease = vi.fn()
    constructor() {
      envs.push(this)
    }
    dispose() {}
  }
  class FakeGain {
    writes: number[] = []
    disposed = false
    gain: { value: number }
    constructor() {
      const writes = this.writes
      let v = 1
      this.gain = {
        get value() {
          return v
        },
        set value(x: number) {
          v = x
          writes.push(x)
        },
      }
      gains.push(this)
    }
    connect() {}
    disconnect() {}
    dispose() {
      this.disposed = true
    }
  }
  class FakePlayer {
    loaded = false
    state = 'stopped'
    loop = false
    playbackRate = 1
    volume = { value: 0 }
    buffer = { duration: 1 }
    start = vi.fn(() => { this.state = 'started' })
    stop = vi.fn(() => { this.state = 'stopped' })
    constructor(public opts: { onerror: (e: Error) => void }) {
      players.push(this)
    }
    dispose() {}
  }
  return { ...actual, AmplitudeEnvelope: FakeEnvelope, Gain: FakeGain, Player: FakePlayer }
})

import { setParam, setProp, envelopeExecutor, audioNodes, gcAudioState, disposeAllAudioNodes } from '@/registry/audio/shared'
import gainNode from '@/registry/audio/gain/node'
import audioPlayerNode from '@/registry/audio/audio-player/node'

beforeEach(() => {
  disposeAllAudioNodes()
  envs.length = 0
  gains.length = 0
  players.length = 0
})

describe('setParam / setProp — change-only writes (D5)', () => {
  it('writes a Param value once per distinct value', () => {
    const writes: number[] = []
    const param = {
      set value(v: number) {
        writes.push(v)
      },
      get value() {
        return writes[writes.length - 1] ?? 0
      },
    }
    setParam(param, 0.5)
    setParam(param, 0.5)
    setParam(param, 0.5)
    setParam(param, 0.7)
    expect(writes).toEqual([0.5, 0.7])
  })

  it('tracks props independently per target and key', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 0, y: 0 }
    setProp(a, 'x', 1)
    a.x = 99 // external mutation is not re-stomped while the requested value is unchanged
    setProp(a, 'x', 1)
    expect(a.x).toBe(99)
    setProp(b, 'x', 1)
    expect(b.x).toBe(1)
    setProp(a, 'y', 2)
    expect(a.y).toBe(2)
  })
})

describe('gain node — no per-frame Param writes', () => {
  it('writes gain only when it changes', () => {
    const audio = { connect: vi.fn(), disconnect: vi.fn() }
    for (let i = 0; i < 5; i++) gainNode.executor(makeContext({ audio }, { gain: 0.8 }, { nodeId: 'g1' }))
    expect(gains).toHaveLength(1)
    // Constructor arg is not routed through the setter; exactly one runtime write
    expect(gains[0].writes).toEqual([0.8])
    gainNode.executor(makeContext({ audio }, { gain: 0.3 }, { nodeId: 'g1' }))
    expect(gains[0].writes).toEqual([0.8, 0.3])
  })
})

describe('envelope — rising-edge triggers', () => {
  it('a held-high trigger attacks once, not every frame', () => {
    for (let i = 0; i < 4; i++) envelopeExecutor(makeContext({ trigger: true }, {}, { nodeId: 'env-held' }))
    expect(envs[0].triggerAttack).toHaveBeenCalledTimes(1)
    envelopeExecutor(makeContext({ trigger: false }, {}, { nodeId: 'env-held' }))
    envelopeExecutor(makeContext({ trigger: true }, {}, { nodeId: 'env-held' }))
    expect(envs[0].triggerAttack).toHaveBeenCalledTimes(2)
  })

  it('a held release fires once; the release-TIME control never reads as a trigger', () => {
    // release control (0.3 s) with no release input wired must not trigger a release
    envelopeExecutor(makeContext({}, { release: 0.3 }, { nodeId: 'env-rel' }))
    expect(envs[0].triggerRelease).not.toHaveBeenCalled()
    for (let i = 0; i < 3; i++) envelopeExecutor(makeContext({ release: true }, { release: 0.3 }, { nodeId: 'env-rel' }))
    expect(envs[0].triggerRelease).toHaveBeenCalledTimes(1)
  })
})

describe('gcAudioState — never disposes the upstream node behind an `_input` link', () => {
  it('deleting a downstream effect leaves the live upstream Tone node intact', () => {
    const upstream = { dispose: vi.fn(), disconnect: vi.fn() }
    const own = { dispose: vi.fn() }
    audioNodes.set('up', upstream as never)
    audioNodes.set('down', own as never)
    audioNodes.set('down_input', upstream as never)
    gcAudioState(new Set(['up']))
    expect(own.dispose).toHaveBeenCalled()
    expect(upstream.dispose).not.toHaveBeenCalled()
    expect(upstream.disconnect).toHaveBeenCalledWith(own)
    expect(audioNodes.get('up')).toBe(upstream)
    expect(audioNodes.has('down')).toBe(false)
    expect(audioNodes.has('down_input')).toBe(false)
  })
})

describe('audio-player — a pending Play does not outlive its clip', () => {
  const run = (inputs: Record<string, unknown>) =>
    audioPlayerNode.executor(makeContext(inputs, {}, { nodeId: 'ap' }))

  it('a load error drops the pending Play; a later URL does not auto-start', async () => {
    await run({ url: 'a.wav', play: true })
    players[0].opts.onerror(new Error('404'))
    await run({ url: 'b.wav' })
    players[1].loaded = true
    await run({ url: 'b.wav' })
    expect(players[1].start).not.toHaveBeenCalled()
  })

  it('a URL change drops a Play still pending on the old clip; a new Play edge starts it', async () => {
    await run({ url: 'a.wav', play: true })
    await run({ url: 'b.wav', play: false })
    players[1].loaded = true
    await run({ url: 'b.wav', play: false })
    expect(players[1].start).not.toHaveBeenCalled()
    await run({ url: 'b.wav', play: true })
    expect(players[1].start).toHaveBeenCalledTimes(1)
  })
})
