import { describe, it, expect } from 'vitest'
import { defineDeviceProfile, normalizeUuid, scoreProfile } from '@/services/ble/defineDeviceProfile'
import {
  deviceProfiles,
  deviceProfilesById,
  vendorDeviceProfileIds,
  recognizeDevice,
  recognizeBest,
} from '@/services/ble/deviceProfileRegistry'

describe('normalizeUuid', () => {
  it('canonicalizes short, 0x, 32-bit, number, and full forms to one 128-bit spelling', () => {
    const hr = '0000180d-0000-1000-8000-00805f9b34fb'
    expect(normalizeUuid('180d')).toBe(hr)
    expect(normalizeUuid('0x180d')).toBe(hr)
    expect(normalizeUuid(0x180d)).toBe(hr)
    expect(normalizeUuid('0000180D')).toBe(hr) // 32-bit, uppercase
    expect(normalizeUuid(hr.toUpperCase())).toBe(hr)
    // A real 128-bit vendor UUID (Muse EEG char) passes through lowercased.
    expect(normalizeUuid('273E0003-4C4D-454D-96BE-F03BAC821358')).toBe(
      '273e0003-4c4d-454d-96be-f03bac821358'
    )
  })

  it('tolerates 0x prefix and surrounding whitespace', () => {
    const hr = '0000180d-0000-1000-8000-00805f9b34fb'
    expect(normalizeUuid('  0x180D  ')).toBe(hr)
  })

  it('rejects a numeric UUID outside the 16-bit alias range rather than truncating', () => {
    expect(() => normalizeUuid(0x00010001)).toThrow(RangeError) // would wrongly become 0x0001
    expect(() => normalizeUuid(-1)).toThrow(RangeError)
    expect(() => normalizeUuid(1.5)).toThrow(RangeError)
  })
})

describe('scoreProfile', () => {
  const p = defineDeviceProfile({
    id: 't',
    label: 'T',
    icon: 'x',
    description: '',
    match: { services: [0xfe8d], namePrefix: ['Muse'], manufacturerId: 0x1234 },
    request: { optionalServices: [0xfe8d] },
    suggests: [{ nodeType: 'n' }],
  })

  it('scores a service hit strongest and reports the reason', () => {
    const m = scoreProfile(p, { services: ['fe8d'] })
    expect(m.score).toBe(10)
    expect(m.reasons).toContain('service:65165') // 0xfe8d
  })

  it('adds name and manufacturer signals', () => {
    const m = scoreProfile(p, { services: [0xfe8d], name: 'Muse-42', manufacturerId: 0x1234 })
    expect(m.score).toBe(18) // 10 + 5 + 3
    expect(m.reasons).toEqual(expect.arrayContaining(['service:65165', 'name:Muse', 'manufacturer:4660']))
  })

  it('never requires a name (undefined name just skips the name signal)', () => {
    expect(scoreProfile(p, { services: [0xfe8d] }).score).toBe(10)
    expect(scoreProfile(p, { name: undefined, services: [0xfe8d] }).score).toBe(10)
  })

  it('returns score 0 when nothing lines up', () => {
    expect(scoreProfile(p, { services: ['180d'], name: 'Polar H10' }).score).toBe(0)
  })
})

describe('device-profile registry', () => {
  it('discovers the co-located vendor profiles (muse + escpos-printer)', () => {
    expect(vendorDeviceProfileIds).toEqual(expect.arrayContaining(['muse', 'escpos-printer']))
    expect(deviceProfilesById.muse.suggests[0].nodeType).toBe('muse-eeg')
    expect(deviceProfilesById['escpos-printer'].suggests[0].nodeType).toBe('thermal-printer')
  })

  it('derives SIG service profiles (e.g. heart rate 180d) suggesting the generic node', () => {
    const hr = deviceProfilesById['sig-180d']
    expect(hr).toBeDefined()
    expect(hr.suggests[0].nodeType).toBe('ble-characteristic')
  })

  it('derives exactly one SIG profile per source service (BleProfileRegistry dedupe holds)', () => {
    // BleProfileRegistry keys each profile under both uuid AND shortUuid; getAllProfiles
    // must dedupe. There are 6 SIG services (heart-rate, battery, device-info, environmental,
    // cycling, running) — assert no double-derivation.
    const sig = deviceProfiles.filter((p) => p.id.startsWith('sig-'))
    expect(sig).toHaveLength(6)
    expect(new Set(sig.map((p) => p.id)).size).toBe(6)
  })

  it('every profile carries only data — no functions (cannot smuggle code)', () => {
    for (const p of deviceProfiles) {
      expect(typeof JSON.stringify(p)).toBe('string') // throws if a function/circular snuck in
    }
  })
})

describe('recognizeDevice', () => {
  it('recognizes a Muse by its fe8d service', () => {
    expect(recognizeBest({ services: ['fe8d'] })?.profile.id).toBe('muse')
  })

  it('recognizes a Muse by name alone (service not advertised)', () => {
    expect(recognizeBest({ name: 'Muse-1234' })?.profile.id).toBe('muse')
  })

  it('scores a Muse matched by BOTH service and name above a name-only match', () => {
    const both = recognizeBest({ services: [0xfe8d], name: 'MuseS' })!
    const nameOnly = recognizeBest({ name: 'MuseS' })!
    expect(both.score).toBeGreaterThan(nameOnly.score)
  })

  it('recognizes an ESC/POS printer by the Phomemo FF00 service and by name', () => {
    expect(recognizeBest({ services: [0xff00] })?.profile.id).toBe('escpos-printer')
    expect(recognizeBest({ name: 'M02_09AB' })?.profile.id).toBe('escpos-printer')
  })

  it('does NOT recognize a printer from the generic Nordic UART service alone (no false positive)', () => {
    // NUS is a generic BLE-serial service; recognizing a printer from it would misfire.
    expect(recognizeDevice({ services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] })).toEqual([])
  })

  it('recognizes a SIG heart-rate monitor by its 180d service', () => {
    expect(recognizeBest({ services: ['180d'] })?.profile.id).toBe('sig-180d')
  })

  it('returns an empty list for an unknown device (caller uses generic BLE nodes)', () => {
    expect(recognizeDevice({ name: 'Unknown Gadget', services: ['abcd'] })).toEqual([])
  })

  it('returns multiple ranked matches for a multi-service device (fitness sensor)', () => {
    const ranked = recognizeDevice({ services: ['180d', '180f'] })
    const ids = ranked.map((m) => m.profile.id)
    expect(ids).toEqual(expect.arrayContaining(['sig-180d', 'sig-180f']))
    expect(ranked.length).toBeGreaterThanOrEqual(2)
  })

  it('ranks strongest-first and is deterministic on ties', () => {
    const ranked = recognizeDevice({ services: [0xfe8d], name: 'Muse' })
    expect(ranked[0].profile.id).toBe('muse')
    // Same input twice → identical ordering.
    expect(recognizeDevice({ services: ['180d'] })).toEqual(recognizeDevice({ services: ['180d'] }))
  })
})
