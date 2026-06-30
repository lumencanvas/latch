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
} from '@/services/connections/adapters'
import { getConnectionManager } from '@/services/connections'

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
})
