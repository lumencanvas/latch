import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getPlatformCapabilities,
  getCapabilityStatus,
  getPlatformTier,
  isIOS,
  isAndroid,
  isMobile,
} from '@/utils/platform'

/**
 * Capability matrix (mod/p5-capability): which hardware/web features are usable
 * per platform tier, so nodes can show a clear "unavailable here — use X" state
 * instead of silently failing. Tests simulate each tier by stubbing navigator/
 * window.
 */

const UA = {
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
}

function setEnv(opts: {
  ua?: string
  features?: Array<'serial' | 'midi' | 'bluetooth' | 'gpu'>
  media?: boolean
  electron?: boolean
}) {
  const features = new Set(opts.features ?? [])
  const navigator: Record<string, unknown> = {
    userAgent: opts.electron ? `${opts.ua ?? UA.desktopChrome} Electron/30` : (opts.ua ?? ''),
    platform: '',
    maxTouchPoints: 0,
  }
  if (features.has('serial')) navigator.serial = {}
  if (features.has('midi')) navigator.requestMIDIAccess = () => {}
  if (features.has('bluetooth')) navigator.bluetooth = {}
  if (features.has('gpu')) navigator.gpu = {}
  if (opts.media) navigator.mediaDevices = { getUserMedia: () => {} }
  vi.stubGlobal('navigator', navigator)
  vi.stubGlobal('window', opts.electron ? { electronAPI: {} } : {})
}

afterEach(() => vi.unstubAllGlobals())

describe('platform tier detection', () => {
  it('detects iOS Safari', () => {
    setEnv({ ua: UA.iosSafari, media: true })
    expect(isIOS()).toBe(true)
    expect(isMobile()).toBe(true)
    expect(getPlatformTier()).toBe('ios-web')
  })

  it('detects Android Chrome', () => {
    setEnv({ ua: UA.androidChrome, features: ['gpu', 'bluetooth'], media: true })
    expect(isAndroid()).toBe(true)
    expect(isMobile()).toBe(true)
    expect(getPlatformTier()).toBe('android-web')
  })

  it('detects desktop web', () => {
    setEnv({ ua: UA.desktopChrome, features: ['serial', 'midi', 'bluetooth', 'gpu'], media: true })
    expect(isMobile()).toBe(false)
    expect(getPlatformTier()).toBe('desktop-web')
  })

  it('detects Electron', () => {
    setEnv({ electron: true })
    expect(getPlatformTier()).toBe('electron')
  })
})

describe('getPlatformCapabilities matrix', () => {
  it('desktop Chrome exposes the web hardware + WebGPU APIs', () => {
    setEnv({ ua: UA.desktopChrome, features: ['serial', 'midi', 'bluetooth', 'gpu'], media: true })
    const c = getPlatformCapabilities()
    expect(c).toMatchObject({ webSerial: true, webMidi: true, webBluetooth: true, webgpu: true, camera: true })
  })

  it('iOS Safari lacks Serial/MIDI/Bluetooth/WebGPU but has camera', () => {
    setEnv({ ua: UA.iosSafari, media: true })
    const c = getPlatformCapabilities()
    expect(c.webSerial).toBe(false)
    expect(c.webMidi).toBe(false)
    expect(c.webBluetooth).toBe(false)
    expect(c.webgpu).toBe(false)
    expect(c.camera).toBe(true)
  })

  it('Electron exposes native capabilities', () => {
    setEnv({ electron: true })
    const c = getPlatformCapabilities()
    expect(c).toMatchObject({
      udp: true,
      filesystem: true,
      nativeSerial: true,
      nativeMidi: true,
      dmx: true,
      mdns: true,
      nativeClaspRouter: true,
    })
  })
})

describe('getCapabilityStatus', () => {
  it('returns available with no reason when the capability is present', () => {
    setEnv({ ua: UA.desktopChrome, features: ['gpu'], media: true })
    expect(getCapabilityStatus('webgpu')).toEqual({ available: true })
  })

  it('explains the gap and suggests an alternative when unavailable', () => {
    setEnv({ ua: UA.iosSafari, media: true })
    const midi = getCapabilityStatus('webMidi')
    expect(midi.available).toBe(false)
    expect(midi.reason).toBeTruthy()
    expect(midi.suggestion).toMatch(/CLASP Bridge|desktop/i)

    const gpu = getCapabilityStatus('webgpu')
    expect(gpu.available).toBe(false)
    expect(gpu.suggestion).toMatch(/Chromium|Chrome|desktop/i)
  })
})
