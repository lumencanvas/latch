import { describe, it, expect } from 'vitest'
import { nodeTrust, isPreTrusted, DEFAULT_TRUST, type TrustTier } from '@/services/security/trust'

/**
 * Trust tiers (SECURITY_MODEL step 3). The tier is the signal the capability gate keys
 * off; the default MUST be `core` so built-ins (which never set the field) stay ungated
 * and existing behavior is unchanged.
 */
describe('node trust tiers', () => {
  it('defaults an unset trust to core (built-in behavior preserved)', () => {
    expect(DEFAULT_TRUST).toBe('core')
    expect(nodeTrust(undefined)).toBe('core')
    expect(nodeTrust(null)).toBe('core')
    expect(nodeTrust({})).toBe('core')
  })

  it('returns the explicitly assigned tier', () => {
    expect(nodeTrust({ trust: 'local' })).toBe('local')
    expect(nodeTrust({ trust: 'community' })).toBe('community')
    expect(nodeTrust({ trust: 'core' })).toBe('core')
  })

  it('pre-trusts core + local, gates community only', () => {
    expect(isPreTrusted('core')).toBe(true)
    expect(isPreTrusted('local')).toBe(true)
    expect(isPreTrusted('community')).toBe(false)
  })

  it('covers every tier (no tier is silently un-handled)', () => {
    const tiers: TrustTier[] = ['core', 'local', 'community']
    for (const t of tiers) expect(typeof isPreTrusted(t)).toBe('boolean')
  })
})
