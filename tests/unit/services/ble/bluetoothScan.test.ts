import { describe, it, expect } from 'vitest'
import { normalizeUuid } from '@/services/ble/defineDeviceProfile'
import { deviceProfiles, deviceProfilesById } from '@/services/ble/deviceProfileRegistry'
import {
  scanAllOptionalServices,
  recognizeByName,
  buildDeviceNodeChain,
} from '@/services/ble/bluetoothScan'

const MUSE_SERVICE = '0000fe8d-0000-1000-8000-00805f9b34fb'

describe('scanAllOptionalServices', () => {
  it('unions every profile optionalService, de-duplicated by canonical UUID', () => {
    const union = scanAllOptionalServices()
    const canon = union.map((u) => normalizeUuid(u))
    // No duplicates after canonicalization.
    expect(new Set(canon).size).toBe(canon.length)
    // Contains every declared optionalService from every profile.
    for (const profile of deviceProfiles) {
      for (const svc of profile.request.optionalServices) {
        expect(canon).toContain(normalizeUuid(svc))
      }
    }
    // Muse's EEG service is in there.
    expect(canon).toContain(MUSE_SERVICE)
  })

  it('preserves the original (short/long) spelling the Web Bluetooth API accepts', () => {
    // Muse declares its service as the number 0xfe8d — keep it a number, not a string.
    const union = scanAllOptionalServices()
    expect(union).toContain(0xfe8d)
  })
})

describe('recognizeByName', () => {
  it('recognizes a Muse by its advertised name prefix', () => {
    expect(recognizeByName('Muse-1234')?.id).toBe('muse')
    expect(recognizeByName('MuseS-A1B2')?.id).toBe('muse')
  })

  it('recognizes an ESC/POS printer by a known name prefix', () => {
    expect(recognizeByName('M02 Pro')?.id).toBe('escpos-printer')
    expect(recognizeByName('Phomemo T02')?.id).toBe('escpos-printer')
  })

  it('returns null for an unknown or missing name (never throws)', () => {
    expect(recognizeByName('Some Random Gadget')).toBeNull()
    expect(recognizeByName('')).toBeNull()
    expect(recognizeByName(undefined)).toBeNull()
    expect(recognizeByName(null)).toBeNull()
  })
})

describe('buildDeviceNodeChain', () => {
  const muse = deviceProfilesById['muse']
  const allInstalled = () => true
  const noneInstalled = () => false

  it('drops the dedicated vendor node, pre-bound by deviceId, when it is installed', () => {
    const spec = buildDeviceNodeChain(muse, 'dev-42', allInstalled)
    expect(spec.usedVendorNode).toBe(true)
    expect(spec.nodes).toHaveLength(1)
    expect(spec.nodes[0].nodeType).toBe('muse-eeg')
    expect(spec.nodes[0].data.deviceId).toBe('dev-42')
    expect(spec.edges).toEqual([])
  })

  it('falls back to the pre-filled generic pair (scanner → device) when the vendor node is not installed', () => {
    const spec = buildDeviceNodeChain(muse, 'dev-42', noneInstalled)
    expect(spec.usedVendorNode).toBe(false)
    const scanner = spec.nodes.find((n) => n.nodeType === 'ble-scanner')!
    expect(scanner.data.deviceId).toBe('dev-42')
    expect(scanner.data.serviceFilter).toBe('custom')
    expect(scanner.data.customServiceUUID).toBe(MUSE_SERVICE)
    expect(scanner.data.nameFilter).toBe('Muse')
    // Device node: auto-connects + enumerates ALL services (no serviceUUID narrowing).
    // No second GATT consumer.
    const device = spec.nodes.find((n) => n.nodeType === 'ble-device')!
    expect(device.data.serviceUUID).toBeUndefined()
    expect(device.data.autoConnect).toBe(true)
    expect(spec.nodes.some((n) => n.nodeType === 'ble-characteristic')).toBe(false)
    // Single wire: scanner.device → device.device.
    expect(spec.edges).toEqual([
      { from: 'scanner', fromPort: 'device', to: 'ble-device', toPort: 'device' },
    ])
  })

  it('builds a blank generic pair for an unrecognized device, still bound by deviceId', () => {
    const spec = buildDeviceNodeChain(null, 'dev-99', allInstalled)
    expect(spec.usedVendorNode).toBe(false)
    const scanner = spec.nodes.find((n) => n.nodeType === 'ble-scanner')!
    expect(scanner.data.deviceId).toBe('dev-99')
    expect(scanner.data.serviceFilter).toBe('any')
    expect(scanner.data.customServiceUUID).toBe('')
    expect(scanner.data.nameFilter).toBe('')
    expect(spec.nodes.find((n) => n.nodeType === 'ble-device')!.data.serviceUUID).toBeUndefined()
  })

  it('never treats a generic ble-* suggestion as a vendor node, even if installed', () => {
    // SIG-derived profiles suggest the generic ble-characteristic node; that must
    // stay the generic chain path, not be dropped as a single "vendor" node.
    const sig = deviceProfiles.find((p) => (p.suggests[0]?.nodeType ?? '').startsWith('ble-'))
    if (!sig) return // no such profile shipped — nothing to assert
    const spec = buildDeviceNodeChain(sig, 'dev-1', allInstalled)
    expect(spec.usedVendorNode).toBe(false)
    expect(spec.nodes.some((n) => n.nodeType === 'ble-scanner')).toBe(true)
  })
})
