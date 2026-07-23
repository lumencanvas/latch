import { describe, it, expect } from 'vitest'
import {
  deviceProfiles,
  recognizeBest,
  profileForNodeType,
} from '@/services/ble/deviceProfileRegistry'
import {
  intensityToByte,
  encodeMotorFrame,
  base64FromBytes,
  motorsVibrateCommand,
  extractJsonObjects,
  readCliEvent,
  hexToRgb,
  ledsSetCommand,
  BUZZ_DEFAULT_MIN_BYTE,
  BUZZ_DEFAULT_MAX_BYTE,
} from '@/services/ble/neosensory/buzzProtocol'

describe('Neosensory Buzz — device recognition', () => {
  it('registers the buzz profile', () => {
    expect(deviceProfiles.find((p) => p.id === 'neosensory-buzz')).toBeDefined()
  })

  it('recognizes a Buzz by its advertised name', () => {
    expect(recognizeBest({ name: 'Buzz 1234' })?.profile.id).toBe('neosensory-buzz')
  })

  it('does NOT recognize a Buzz by the (generic) NUS service alone', () => {
    // NUS is shared by many serial devices — matching on it would false-positive.
    const match = recognizeBest({ services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] })
    expect(match?.profile.id).not.toBe('neosensory-buzz')
  })

  it('maps the buzz node type back to its profile', () => {
    expect(profileForNodeType('neosensory-buzz')?.id).toBe('neosensory-buzz')
  })

  it('the primary suggestion drops the neosensory-buzz node', () => {
    const p = profileForNodeType('neosensory-buzz')
    expect(p?.suggests.some((s) => s.nodeType === 'neosensory-buzz' && s.primary)).toBe(true)
  })
})

describe('Neosensory Buzz — motor frame encoding', () => {
  it('maps 0 intensity to OFF (byte 0) regardless of min', () => {
    expect(intensityToByte(0, 30, 255)).toBe(0)
  })

  it('lerps >0 intensity between min and max bytes', () => {
    expect(intensityToByte(1, 30, 255)).toBe(255)
    expect(intensityToByte(0.5, 30, 255)).toBe(Math.round(30 + 0.5 * (255 - 30)))
  })

  it('clamps out-of-range intensities and non-finite input', () => {
    expect(intensityToByte(5, 30, 255)).toBe(255)
    expect(intensityToByte(-1, 30, 255)).toBe(0)
    expect(intensityToByte(Number.NaN, 30, 255)).toBe(0)
  })

  it('encodes a 4-motor frame to bytes + base64 + a stable dedupe key', () => {
    const f = encodeMotorFrame([1, 0, 0.5, 0], BUZZ_DEFAULT_MIN_BYTE, BUZZ_DEFAULT_MAX_BYTE)
    expect(f.bytes).toHaveLength(4)
    expect(f.bytes[0]).toBe(255)
    expect(f.bytes[1]).toBe(0)
    expect(f.base64).toBe(base64FromBytes(f.bytes))
    expect(f.key).toBe(Array.from(f.bytes).join(','))
  })

  it('produces identical dedupe keys for identical frames', () => {
    const a = encodeMotorFrame([0.3, 0, 0, 0], 30, 255)
    const b = encodeMotorFrame([0.3, 0, 0, 0], 30, 255)
    expect(a.key).toBe(b.key)
  })

  it('builds the motors vibrate CLI command', () => {
    const f = encodeMotorFrame([0, 0, 0, 0], 30, 255)
    expect(motorsVibrateCommand(f.base64)).toBe(`motors vibrate ${f.base64}`)
  })
})

describe('Neosensory Buzz — CLI parsing', () => {
  it('extracts complete JSON objects and keeps a partial tail', () => {
    const { objects, rest } = extractJsonObjects('noise {"battery_soc":42} {"button":0} {"batt')
    expect(objects).toHaveLength(2)
    expect(rest).toBe('{"batt')
  })

  it('reassembles an object split across two notifications', () => {
    const first = extractJsonObjects('{"battery_')
    expect(first.objects).toHaveLength(0)
    const second = extractJsonObjects(first.rest + 'soc":88}')
    expect(second.objects).toHaveLength(1)
    expect(readCliEvent(second.objects[0]).battery).toBe(88)
  })

  it('reads battery as a number or a { percentage } object', () => {
    expect(readCliEvent({ battery_soc: 55 }).battery).toBe(55)
    expect(readCliEvent({ battery_soc: { percentage: 12 } }).battery).toBe(12)
  })

  it('flags a button event only on a TRUTHY button value (not mere presence / released state)', () => {
    expect(readCliEvent({ button: 1 }).button).toBe(1)
    expect(readCliEvent({ button: true }).button).toBe(1)
    expect(readCliEvent({ button: 0 }).button).toBeUndefined() // released state must not fire
    expect(readCliEvent({ button: false }).button).toBeUndefined()
    expect(readCliEvent({ nothing: true }).button).toBeUndefined()
  })

  it('is not desynced by a brace inside a JSON string value (string-aware scan)', () => {
    // A naive brace counter would close early on the in-string "}" and drop/garble the object.
    const { objects, rest } = extractJsonObjects('{"name":"a}b{c","battery_soc":77}')
    expect(objects).toHaveLength(1)
    expect(rest).toBe('')
    expect(readCliEvent(objects[0]).battery).toBe(77)
  })

  it('keeps an object that ends mid-string for the next chunk, then completes it', () => {
    const first = extractJsonObjects('{"note":"pa}rt')
    expect(first.objects).toHaveLength(0)
    const second = extractJsonObjects(first.rest + 'ial","battery_soc":9}')
    expect(second.objects).toHaveLength(1)
    expect(readCliEvent(second.objects[0]).battery).toBe(9)
  })
})

describe('Neosensory Buzz — LED command (experimental)', () => {
  it('parses hex colours (#rgb and #rrggbb)', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
    expect(hexToRgb('00ff00')).toEqual([0, 255, 0])
    expect(hexToRgb('nope')).toBeNull()
  })

  it('builds a leds set command clamped to the LED intensity range', () => {
    const cmd = ledsSetCommand([255, 0, 0], 999)
    expect(cmd.startsWith('leds set ')).toBe(true)
    expect(cmd).toContain('[255,0,0]')
    expect(cmd).toContain('[50,50,50]') // intensity clamped to 0..50
  })
})
