/**
 * Connectivity node regressions (Nov 2026 node audit).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import {
  getCached,
  setCached,
  oscState,
  serialState,
  bleState,
  midiState,
  midiOutputs,
  midiNoteOffTimeouts,
  disposeConnectivityNode,
  disposeAllConnectivityNodes,
  bleCharacteristicState,
  bleAdapters,
} from '@/registry/connectivity/shared'
import oscNode from '@/registry/connectivity/osc/node'
import midiOutputNode from '@/registry/connectivity/midi-output/node'
import bleScannerNode from '@/registry/connectivity/ble-scanner/node'
import { BleAdapter } from '@/services/connections/adapters/BleAdapter'

function ctx(nodeId: string, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

afterEach(() => {
  disposeAllConnectivityNodes()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getCached reads every connectivity cache', () => {
  it('returns osc/serial/ble values (they used to always read back the default)', () => {
    setCached(oscState, 'n-osc:connected', true)
    setCached(serialState, 'n-ser:line', 'hello')
    setCached(bleState, 'n-ble:value', 42)
    setCached(midiState, 'n-midi:note', 60)
    expect(getCached('n-osc:connected', false)).toBe(true)
    expect(getCached('n-ser:line', '')).toBe('hello')
    expect(getCached('n-ble:value', null)).toBe(42)
    expect(getCached('n-midi:note', null)).toBe(60)
  })
})

describe('disposeConnectivityNode', () => {
  it('clears only its own `${nodeId}:` keys, not those of a node whose id merely starts with it', () => {
    oscState.set('abc:connected', true)
    oscState.set('abcd:connected', true)
    disposeConnectivityNode('abc')
    expect(oscState.has('abc:connected')).toBe(false)
    expect(oscState.has('abcd:connected')).toBe(true)
  })

  it('flushes a pending MIDI Note Off on dispose instead of leaving the note stuck on', async () => {
    const send = vi.fn()
    midiOutputs.set('mo:midi', { send } as unknown as MIDIOutput)
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: vi.fn() })
    await midiOutputNode.executor(ctx('mo', { note: 64, velocity: 1, trigger: 1 }, { channel: 2 }))
    expect(send).toHaveBeenCalledWith([0x92, 64, 127]) // Note On
    expect(midiNoteOffTimeouts.get('mo')).toHaveLength(1)
    disposeConnectivityNode('mo')
    expect(send).toHaveBeenLastCalledWith([0x82, 64, 0]) // Note Off sent immediately
  })
})

describe('midi-output', () => {
  it('an unwired note does not throw; out-of-range values are clamped to MIDI bytes', async () => {
    const send = vi.fn()
    midiOutputs.set('mo2:midi', { send } as unknown as MIDIOutput)
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: vi.fn() })
    await expect(midiOutputNode.executor(ctx('mo2', { trigger: 1 }))).resolves.toBeInstanceOf(Map)
    expect(send).not.toHaveBeenCalled()
    await midiOutputNode.executor(ctx('mo2', { trigger: 0 }))
    await midiOutputNode.executor(ctx('mo2', { note: 300, velocity: 5, trigger: 1 }, { channel: 99 }))
    expect(send).toHaveBeenCalledWith([0x9f, 127, 127])
  })

  it('reports unsupported (Safari) instead of silently doing nothing', async () => {
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: undefined })
    const out = await midiOutputNode.executor(ctx('mo3', {}))
    expect(String(out.get('_error'))).toMatch(/Web MIDI/)
  })
})

describe('osc send-on-change re-arms', () => {
  class FakeWS {
    static OPEN = 1
    static instances: FakeWS[] = []
    readyState = 0
    binaryType = ''
    sent: unknown[] = []
    onopen: (() => void) | null = null
    onmessage: unknown = null
    onerror: unknown = null
    onclose: (() => void) | null = null
    constructor(public url: string) { FakeWS.instances.push(this) }
    send(d: unknown) { this.sent.push(d) }
    close() { /* noop */ }
  }

  beforeEach(() => {
    FakeWS.instances = []
    vi.stubGlobal('WebSocket', FakeWS)
  })

  it('an empty/unwired value re-arms, so the same value can be sent again', async () => {
    const run = (send: unknown) => oscNode.executor(ctx('osc1', send === undefined ? {} : { send }, { host: 'h', port: 1, address: '/a', connect: true }))
    await run(1)
    const ws = FakeWS.instances[0]
    ws.readyState = 1
    ws.onopen?.()
    await run(1)
    await run(1)
    expect(ws.sent).toHaveLength(1)
    await run(undefined) // unwired → re-arm
    await run(1)
    expect(ws.sent).toHaveLength(2)
    expect((await run(1)).get('connected')).toBe(true) // getCached now reads oscState
  })
})

describe('ble-scanner', () => {
  it('scans on the trigger RISING edge only (a held trigger no longer re-opens the chooser)', async () => {
    vi.stubGlobal('navigator', { ...navigator, bluetooth: {} })
    const scan = vi.spyOn(BleAdapter, 'scanDevices').mockResolvedValue(null as unknown as BluetoothDevice)
    for (let i = 0; i < 4; i++) await bleScannerNode.executor(ctx('scan1', { trigger: 1 }))
    expect(scan).toHaveBeenCalledTimes(1)
    await bleScannerNode.executor(ctx('scan1', { trigger: 0 }))
    await bleScannerNode.executor(ctx('scan1', { trigger: 1 }))
    expect(scan).toHaveBeenCalledTimes(2)
  })
})

describe('ble-characteristic notified latch', () => {
  it('a notification that landed between frames reads `notified` true for one frame', async () => {
    vi.stubGlobal('navigator', { ...navigator }) // no `bluetooth` → early 'unsupported' return
    const { default: node } = await import('@/registry/connectivity/ble-characteristic/node')
    await node.executor(ctx('bc1'))
    bleCharacteristicState.get('bc1')!.notified = true // as the notification callback does
    const out = await node.executor(ctx('bc1'))
    expect(out.get('notified')).toBe(true)
    const next = await node.executor(ctx('bc1'))
    expect(next.get('notified')).toBe(false)
  }, 60_000)
})

describe('ble-characteristic off-frame read after an adapter swap', () => {
  it('a stale read result does not write into the node state (or clear the new read flag)', async () => {
    vi.stubGlobal('navigator', { ...navigator, bluetooth: {} })
    const { default: node } = await import('@/registry/connectivity/ble-characteristic/node')
    const device = { id: 'dev1' } as unknown as BluetoothDevice
    let resolveRead!: (v: DataView) => void
    const fake = (readImpl: () => Promise<DataView>) => ({
      getDeviceInfo: () => ({ id: 'dev1' }),
      isConnected: () => true,
      readCharacteristicRaw: vi.fn(readImpl),
      unsubscribeFromNotifications: vi.fn(async () => {}),
      getCharacteristicProperties: () => null,
      dispose: vi.fn(),
      status: 'connected',
    })
    const oldA = fake(() => new Promise<DataView>((res) => { resolveRead = res }))
    bleAdapters.set('char_bc-swap', oldA as unknown as BleAdapter)
    const controls = { characteristicUUID: '2a19', enableNotifications: false, dataFormat: 'raw' }
    await node.executor(ctx('bc-swap', { device, read: 1 }, controls)) // starts the off-frame read
    expect(oldA.readCharacteristicRaw).toHaveBeenCalledTimes(1)
    const s = bleCharacteristicState.get('bc-swap')!
    expect(s.reading).toBe(true)

    // Device/adapter swapped while the read is in flight; the new adapter has its own read going.
    bleAdapters.set('char_bc-swap', fake(() => new Promise<DataView>(() => {})) as unknown as BleAdapter)
    s.reading = true
    resolveRead(new DataView(new Uint8Array([77]).buffer))
    await new Promise((r) => setTimeout(r, 0))
    expect(s.value).toBeNull()
    expect(s.rawValue).toBeNull()
    expect(s.reading).toBe(true) // the stale .finally must not clear the new adapter's in-flight flag
  }, 60_000)
})
