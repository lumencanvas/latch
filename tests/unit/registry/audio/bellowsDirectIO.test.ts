import { describe, it, expect, vi, beforeEach } from 'vitest'

// Drives the manager's direct-output / direct-input bookkeeping against a fake kernel and a
// fake Tone (no AudioWorklet under happy-dom): which output a wired node gets, that unwiring
// routes it back to master and frees the slot, that a fresh channel (preset swap) is routed
// again, and that GC / stop free the ports.

const { made, FakeGain, toneConnect } = vi.hoisted(() => {
  const made: { gains: { disposed: boolean }[]; signals: number; liveSignals: number } = { gains: [], signals: 0, liveSignals: 0 }
  class FakeGain {
    disposed = false
    constructor() { made.gains.push(this) }
    connect() { return this }
    disconnect() {}
    dispose() { this.disposed = true }
  }
  return { made, FakeGain, toneConnect: vi.fn() }
})

vi.mock('@/services/audio/AudioManager', () => ({
  audioManager: { initialize: vi.fn(async () => {}), getMasterOutput: vi.fn(() => ({})) },
  Tone: {
    Gain: FakeGain,
    Signal: class {
      constructor() { made.signals++; made.liveSignals++ }
      connect() { return this }
      dispose() { made.liveSignals-- }
    },
    connect: (...a: unknown[]) => toneConnect(...a),
  },
}))

import {
  routeChannel,
  acquireInputPort,
  feedInputPort,
  releaseDirectPorts,
  configureVoice,
  getVoice,
  __setKernelForTest,
  __resetBellowsForTest,
  __disposeAllForTest,
  __gcForTest,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import type { VoiceConfig } from '@/registry/audio/bellows-instrument/engineParams'

function makeInstrument() {
  return {
    note: vi.fn(), on: vi.fn(() => 1), off: vi.fn(), param: vi.fn(), rampParam: vi.fn(),
    fx: vi.fn(), fxParam: vi.fn(), send: vi.fn(), gain: vi.fn(), pan: vi.fn(),
    dispose: vi.fn(), route: vi.fn(),
  }
}

function makeKernel(outputs = 2, inputs = 2) {
  const insts: ReturnType<typeof makeInstrument>[] = []
  return {
    insts,
    outputs,
    inputs,
    outputNode: vi.fn((k: number) => ({ out: k })),
    inputNode: vi.fn((k: number) => ({ in: k })),
    voice: vi.fn(() => {
      const i = makeInstrument()
      insts.push(i)
      return i
    }),
    bus: vi.fn(() => ({ id: 1 })),
    dispose: vi.fn(),
  }
}

const cfg = (over: Partial<VoiceConfig> = {}): VoiceConfig => ({
  preset: '', engine: 'va', params: {}, insertFx: null, fxParams: {}, send: 0, gain: 0.8, pan: 0, ...over,
})

let k: ReturnType<typeof makeKernel>
beforeEach(() => {
  __resetBellowsForTest()
  made.gains.length = 0
  made.signals = 0
  made.liveSignals = 0
  toneConnect.mockClear()
  k = makeKernel()
  __setKernelForTest(k)
})

const inst = (id: string) => getVoice(id)!.instrument as unknown as ReturnType<typeof makeInstrument>

describe('direct outputs', () => {
  it('on the real 16-output kernel an unwired node is silent: routed to the unconnected last output', () => {
    k = makeKernel(16, 16)
    __setKernelForTest(k)
    configureVoice('a', cfg())
    expect(routeChannel('a', getVoice('a')!.instrument, false)).toBeNull()
    expect(inst('a').route).toHaveBeenCalledWith(16)
    expect(k.outputNode).not.toHaveBeenCalled()
    // wiring moves it to a real output, unwiring back to the silent one
    expect(routeChannel('a', getVoice('a')!.instrument, true)).not.toBeNull()
    expect(inst('a').route).toHaveBeenLastCalledWith(1)
    routeChannel('a', getVoice('a')!.instrument, false)
    expect(inst('a').route).toHaveBeenLastCalledWith(16)
  })

  it('the silent output is never handed to a wired node', () => {
    k = makeKernel(16, 16)
    __setKernelForTest(k)
    for (let n = 0; n < 16; n++) {
      configureVoice('v' + n, cfg())
      routeChannel('v' + n, getVoice('v' + n)!.instrument, true)
    }
    expect(inst('v14').route).toHaveBeenCalledWith(15)
    expect(inst('v15').route).toHaveBeenCalledWith(16) // no free output: silent, not master
    expect(k.outputNode).not.toHaveBeenCalledWith(16)
  })

  it('a kernel without a silent output (fewer outputs) leaves an unwired node in master', () => {
    configureVoice('a', cfg())
    expect(routeChannel('a', getVoice('a')!.instrument, false)).toBeNull()
    expect(inst('a').route).not.toHaveBeenCalled()
    expect(k.outputNode).not.toHaveBeenCalled()
  })

  it('wiring routes to the lowest free output once, bridges it into a Tone node, and keeps it alive', () => {
    configureVoice('a', cfg())
    const port = routeChannel('a', getVoice('a')!.instrument, true)
    routeChannel('a', getVoice('a')!.instrument, true) // steady frame: no-op
    expect(port).toBe(made.gains[0])
    expect(inst('a').route).toHaveBeenCalledTimes(1)
    expect(inst('a').route).toHaveBeenCalledWith(1)
    expect(toneConnect).toHaveBeenCalledWith({ out: 1 }, port)
    expect(made.liveSignals).toBe(1) // SAC keep-alive on the port

    configureVoice('b', cfg())
    routeChannel('b', getVoice('b')!.instrument, true)
    expect(inst('b').route).toHaveBeenCalledWith(2)
  })

  it('unwiring routes back to master and frees the slot for another node', () => {
    configureVoice('a', cfg())
    configureVoice('b', cfg())
    routeChannel('a', getVoice('a')!.instrument, true)
    expect(routeChannel('a', getVoice('a')!.instrument, false)).toBeNull()
    expect(inst('a').route).toHaveBeenLastCalledWith(0)
    expect(made.gains[0].disposed).toBe(true)
    expect(made.liveSignals).toBe(0)
    routeChannel('b', getVoice('b')!.instrument, true)
    expect(inst('b').route).toHaveBeenCalledWith(1)
  })

  it('when every output is taken the node stays on master (null audio, no route)', () => {
    k = makeKernel(1)
    __setKernelForTest(k)
    configureVoice('a', cfg())
    configureVoice('b', cfg())
    routeChannel('a', getVoice('a')!.instrument, true)
    expect(routeChannel('b', getVoice('b')!.instrument, true)).toBeNull()
    expect(inst('b').route).not.toHaveBeenCalled()
  })

  it('an older bellowsjs without direct outputs leaves everything on master', () => {
    const old = makeKernel()
    delete (old as { outputs?: number }).outputs
    __setKernelForTest(old)
    configureVoice('a', cfg())
    expect(routeChannel('a', getVoice('a')!.instrument, true)).toBeNull()
  })

  it('a new channel after an engine swap is routed to the same output again', () => {
    configureVoice('a', cfg())
    routeChannel('a', getVoice('a')!.instrument, true)
    configureVoice('a', cfg({ engine: 'fm' }))
    const fresh = inst('a')
    expect(fresh).not.toBe(k.insts[0])
    routeChannel('a', getVoice('a')!.instrument, true)
    expect(fresh.route).toHaveBeenCalledWith(1)
  })

  it('GC and engine stop free the ports', () => {
    configureVoice('a', cfg())
    routeChannel('a', getVoice('a')!.instrument, true)
    __gcForTest(new Set())
    expect(made.gains[0].disposed).toBe(true)
    __setKernelForTest(k) // the last user's GC disposed the kernel; the next node re-boots it
    configureVoice('b', cfg())
    routeChannel('b', getVoice('b')!.instrument, true)
    __disposeAllForTest()
    expect(made.gains.every((g) => g.disposed)).toBe(true)
    expect(made.liveSignals).toBe(0)
  })
})

describe('direct inputs', () => {
  it('allocates an input, connects upstream once, swaps sources, and releases', () => {
    const port = acquireInputPort('fx', k as never)!
    expect(port.k).toBe(1)
    expect(toneConnect).toHaveBeenCalledWith(port.tone, { in: 1 })
    const src1 = { connect: vi.fn(), disconnect: vi.fn() }
    const src2 = { connect: vi.fn(), disconnect: vi.fn() }
    feedInputPort(port, src1)
    feedInputPort(port, src1)
    expect(src1.connect).toHaveBeenCalledTimes(1)
    feedInputPort(port, src2)
    expect(src1.disconnect).toHaveBeenCalledWith(port.tone)
    expect(src2.connect).toHaveBeenCalledWith(port.tone)
    expect(acquireInputPort('fx2', k as never)!.k).toBe(2)
    releaseDirectPorts('fx')
    expect(src2.disconnect).toHaveBeenCalledWith(port.tone)
    expect(acquireInputPort('fx3', k as never)!.k).toBe(1)
  })
})
