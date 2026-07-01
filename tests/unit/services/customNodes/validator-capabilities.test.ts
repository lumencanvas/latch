import { describe, it, expect } from 'vitest'
import { validateDefinition } from '@/services/customNodes/validator'

/**
 * SECURITY_MODEL: the validator must PRESERVE declared capabilities (connections/requires)
 * — they drive the capability gate + disclosure — but STRIP author-supplied `trust`, which
 * is assigned by origin at load (a community node must not be able to claim `core`).
 */
const base = {
  id: 'x',
  name: 'X',
  version: '1.0.0',
  description: '',
  icon: 'box',
  category: 'connectivity',
  platforms: ['web'],
  inputs: [],
  outputs: [],
  controls: [],
}

describe('validateDefinition — declared capabilities', () => {
  it('preserves connections so the declare→approve gate can be satisfied', () => {
    const def = validateDefinition({
      ...base,
      connections: [{ protocol: 'mqtt', controlId: 'connectionId', required: true }],
    })
    expect(def.connections).toEqual([{ protocol: 'mqtt', controlId: 'connectionId', required: true }])
  })

  it('preserves requires', () => {
    const def = validateDefinition({ ...base, requires: ['camera', 'serial'] })
    expect(def.requires).toEqual(['camera', 'serial'])
  })

  it('STRIPS author-supplied trust (must be assigned by origin, not self-declared)', () => {
    const def = validateDefinition({ ...base, trust: 'core' }) as { trust?: string }
    expect(def.trust).toBeUndefined()
  })

  it('rejects a malformed connection (missing protocol)', () => {
    expect(() => validateDefinition({ ...base, connections: [{ controlId: 'connectionId' }] })).toThrow()
  })

  it('rejects an unknown hardware requirement', () => {
    expect(() => validateDefinition({ ...base, requires: ['gps'] })).toThrow()
  })
})
