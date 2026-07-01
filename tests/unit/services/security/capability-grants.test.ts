import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isGranted,
  ensureRequested,
  setGrant,
  setGrantResolver,
  grantState,
  resetGrants,
} from '@/services/security/capabilityGrants'

/**
 * Capability grants + approval (SECURITY_MODEL step 4). Deny-by-default; the approval
 * prompt fires at most once per (nodeType, capability); explicit grants stick.
 */
describe('capability grants', () => {
  beforeEach(() => resetGrants())

  it('denies by default (nothing granted unless approved)', () => {
    expect(isGranted('n', 'connection:mqtt')).toBe(false)
    expect(grantState('n', 'connection:mqtt')).toBe('unknown')
  })

  it('records explicit grant/deny decisions', () => {
    setGrant('n', 'connection:mqtt', true)
    expect(isGranted('n', 'connection:mqtt')).toBe(true)
    setGrant('n', 'connection:mqtt', false)
    expect(isGranted('n', 'connection:mqtt')).toBe(false)
    expect(grantState('n', 'connection:mqtt')).toBe('denied')
  })

  it('ensureRequested fires the injected resolver and records the approval', async () => {
    const resolver = vi.fn(async () => true)
    setGrantResolver(resolver)
    ensureRequested('n', 'connection:mqtt')
    expect(grantState('n', 'connection:mqtt')).toBe('pending')
    await vi.waitFor(() => expect(isGranted('n', 'connection:mqtt')).toBe(true))
    expect(resolver).toHaveBeenCalledOnce()
    expect(resolver).toHaveBeenCalledWith('n', 'connection:mqtt')
  })

  it('a refused approval records a denial', async () => {
    setGrantResolver(async () => false)
    ensureRequested('n', 'connection:mqtt')
    await vi.waitFor(() => expect(grantState('n', 'connection:mqtt')).toBe('denied'))
    expect(isGranted('n', 'connection:mqtt')).toBe(false)
  })

  it('does not re-prompt once a request is pending or decided (idempotent)', async () => {
    const resolver = vi.fn(async () => true)
    setGrantResolver(resolver)
    ensureRequested('n', 'connection:mqtt')
    ensureRequested('n', 'connection:mqtt') // pending — must not re-fire
    await vi.waitFor(() => expect(isGranted('n', 'connection:mqtt')).toBe(true))
    ensureRequested('n', 'connection:mqtt') // already granted — must not re-fire
    expect(resolver).toHaveBeenCalledOnce()
  })

  it('a rejected resolver promise denies (fails safe)', async () => {
    setGrantResolver(async () => {
      throw new Error('user closed the dialog')
    })
    ensureRequested('n', 'connection:mqtt')
    await vi.waitFor(() => expect(grantState('n', 'connection:mqtt')).toBe('denied'))
  })
})
