import { describe, it, expect, beforeEach } from 'vitest'
import { getConnectionManager, resetConnectionManager } from '@/services/connections/ConnectionManager'
import {
  redactConfig,
  mergePreservingSecrets,
  secretFieldIds,
  REDACTED_SECRET,
} from '@/services/connections/redactSecrets'
import type {
  BaseConnectionConfig,
  ConnectionTypeDefinition,
  ConnectionAdapter,
} from '@/services/connections/types'

/**
 * SECURITY_MODEL credential safety (Node-RED-style): the ConnectionManager never hands out
 * secrets through its PUBLIC read API or events — password-typed fields are masked. The real
 * value stays internal (`connect()`/persistence). On update, a field left at the mask is
 * preserved, so a UI round-trip can't erase a saved secret.
 */

const secretType: ConnectionTypeDefinition<BaseConnectionConfig> = {
  id: 'secret-proto',
  name: 'Secret Proto',
  icon: 'plug',
  category: 'protocol',
  description: '',
  platforms: ['web', 'electron'],
  configControls: [
    { id: 'host', type: 'text', label: 'Host', default: '' },
    { id: 'password', type: 'text', label: 'Password', default: '', props: { type: 'password' } },
  ],
  createAdapter: () => ({}) as unknown as ConnectionAdapter,
}

const makeConfig = (over: Partial<BaseConnectionConfig> = {}): BaseConnectionConfig =>
  ({ id: 'c1', protocol: 'secret-proto', name: 'C1', autoConnect: false, password: 's3cret', ...over }) as BaseConnectionConfig

describe('redactSecrets helpers', () => {
  it('detects password-typed + secret-named fields', () => {
    expect(secretFieldIds(secretType)).toEqual(['password'])
    expect(secretFieldIds(undefined)).toEqual([])
  })

  it('masks non-empty secrets, leaves empties and non-secrets alone', () => {
    const r = redactConfig(makeConfig({ password: 's3cret' }), secretType) as Record<string, unknown>
    expect(r.password).toBe(REDACTED_SECRET)
    expect(r.host).toBeUndefined() // not set
    expect(redactConfig(makeConfig({ password: '' }), secretType).password).toBe('') // no secret → stays empty
  })

  it('mergePreservingSecrets keeps a masked field but applies a real change', () => {
    const existing = makeConfig({ password: 'real' })
    expect(mergePreservingSecrets(existing, { password: REDACTED_SECRET } as never, secretType).password).toBe('real')
    expect(mergePreservingSecrets(existing, { password: 'new' } as never, secretType).password).toBe('new')
    expect(mergePreservingSecrets(existing, { password: '' } as never, secretType).password).toBe('') // explicit clear
  })
})

describe('ConnectionManager credential redaction', () => {
  beforeEach(() => resetConnectionManager())

  it('getConnection / getConnections never expose the raw secret', () => {
    const m = getConnectionManager()
    m.registerType(secretType)
    m.addConnection(makeConfig({ password: 's3cret' }))

    expect((m.getConnection('c1') as Record<string, unknown>).password).toBe(REDACTED_SECRET)
    expect((m.getConnections()[0] as Record<string, unknown>).password).toBe(REDACTED_SECRET)
  })

  it('the raw config map is not reachable via casting (# private)', () => {
    const m = getConnectionManager()
    m.registerType(secretType)
    m.addConnection(makeConfig({ password: 's3cret' }))
    expect((m as unknown as { connections?: unknown }).connections).toBeUndefined()
  })

  it('exportConnections KEEPS the real secret (persistence round-trips it)', () => {
    const m = getConnectionManager()
    m.registerType(secretType)
    m.addConnection(makeConfig({ password: 's3cret' }))
    expect((m.exportConnections()[0] as Record<string, unknown>).password).toBe('s3cret')
  })

  it('updating with the mask preserves the stored secret; a real value changes it', () => {
    const m = getConnectionManager()
    m.registerType(secretType)
    m.addConnection(makeConfig({ password: 's3cret' }))

    m.updateConnection('c1', { name: 'renamed', password: REDACTED_SECRET } as never)
    expect((m.exportConnections()[0] as Record<string, unknown>).password).toBe('s3cret') // preserved
    expect((m.exportConnections()[0] as Record<string, unknown>).name).toBe('renamed')

    m.updateConnection('c1', { password: 'rotated' } as never)
    expect((m.exportConnections()[0] as Record<string, unknown>).password).toBe('rotated') // rotated
  })
})
