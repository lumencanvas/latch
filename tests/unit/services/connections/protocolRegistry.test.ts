import { describe, it, expect } from 'vitest'
import {
  protocolSpecs,
  colocatedProtocolIds,
  colocatedProtocolTypes,
} from '@/services/connections/protocolRegistry'
import {
  claspConnectionType,
  websocketConnectionType,
  mqttConnectionType,
  oscConnectionType,
  httpConnectionType,
  bleConnectionType,
} from '@/services/connections/adapters'
import { getConnectionManager } from '@/services/connections'
import { createConnectionHandle } from '@/services/connections/ConnectionHandle'

/**
 * Guard tests for the protocol auto-discovery glob (EXTENSIBILITY §7, POLICIES §1).
 *
 * As of step 6b the glob over `protocols/<name>/protocol.ts` is the authoritative
 * source `registerBuiltInTypes()` loops over, so the count guard is a real
 * equality gate: adding a built-in `*ConnectionType` without co-locating it (or
 * vice versa) fails CI. The dup-id and default-export guards run at module load
 * (the import above would throw). Mirrors `nodeRegistry`.
 */

// The protocols `registerBuiltInTypes()` is responsible for registering, derived
// from the live `*ConnectionType` objects so the expectation can't drift.
const builtInProtocolIds = new Set(
  [
    claspConnectionType,
    websocketConnectionType,
    mqttConnectionType,
    oscConnectionType,
    httpConnectionType,
    bleConnectionType,
  ].map((t) => t.id)
)

describe('protocolRegistry auto-glob', () => {
  it('imports without throwing (no duplicate ids, no missing default exports)', () => {
    // Reaching here means the module-load guards in protocolRegistry.ts passed.
    expect(typeof protocolSpecs).toBe('object')
    expect(Array.isArray(colocatedProtocolTypes)).toBe(true)
  })

  it('has no duplicate co-located protocol ids', () => {
    expect(new Set(colocatedProtocolIds).size).toBe(colocatedProtocolIds.length)
  })

  it('every co-located protocol exposes a createAdapter factory', () => {
    for (const spec of colocatedProtocolTypes) {
      expect(typeof spec.createAdapter).toBe('function')
    }
  })

  it('count gate: co-located protocols exactly equal the built-in set', () => {
    // POLICIES protocol-count gate. Set-equality (membership, not just size) so a
    // swapped id is caught too.
    expect(new Set(colocatedProtocolIds)).toEqual(builtInProtocolIds)
  })

  it('registerBuiltInTypes registers every co-located protocol with the manager', () => {
    // Proves the wiring: the index barrel loops over the glob, not a hardcoded list.
    const manager = getConnectionManager()
    const registeredIds = new Set(manager.getTypes().map((t) => t.id))
    expect(registeredIds).toEqual(new Set(colocatedProtocolIds))
  })

  it('includes BLE (the previously-unregistered adapter) as a registered protocol', () => {
    expect(colocatedProtocolIds).toContain('ble')
    const manager = getConnectionManager()
    expect(manager.getTypes().some((t) => t.id === 'ble')).toBe(true)
  })
})

describe('bleConnectionType', () => {
  const config = {
    id: 'ble-1',
    name: 'Heart Rate',
    protocol: 'ble' as const,
    serviceUUID: '0x180d',
    autoConnect: false,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  }

  it('is well-formed and defaults autoConnect off (Web Bluetooth needs a gesture)', () => {
    expect(bleConnectionType.id).toBe('ble')
    expect(bleConnectionType.category).toBe('protocol')
    expect(bleConnectionType.platforms).toContain('web')
    expect(bleConnectionType.defaultConfig.autoConnect).toBe(false)
    expect(bleConnectionType.configControls.some((c) => c.id === 'serviceUUID')).toBe(true)
  })

  it('createAdapter builds a ble adapter carrying the config id, without touching hardware', () => {
    const adapter = bleConnectionType.createAdapter(config)
    expect(adapter.protocol).toBe('ble')
    expect(adapter.connectionId).toBe('ble-1')
    adapter.dispose()
  })

  it('resolves to a no-secret handle: no serviceUUID/config/adapter reachable', () => {
    const adapter = bleConnectionType.createAdapter(config)
    const handle = createConnectionHandle(adapter)
    expect(handle.protocol).toBe('ble')
    expect((handle as Record<string, unknown>).config).toBeUndefined()
    expect((handle as Record<string, unknown>).serviceUUID).toBeUndefined()
    expect((handle as Record<string, unknown>).adapter).toBeUndefined()
    expect(JSON.stringify(handle)).not.toContain('0x180d')
    adapter.dispose()
  })
})
