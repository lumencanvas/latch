import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SECURITY_MODEL steps 2 + 4 — the capability gate inside resolveConnectionHandle().
 *
 * A community node may only reach a connection whose protocol it DECLARED (step 2) AND
 * that the user has APPROVED (step 4); core/local nodes bypass (pre-trusted). Undeclared
 * or ungranted community access is denied (null handle). The connections store is mocked
 * so the test is pure (no broker / hardware). Everything the mock needs is defined inside
 * the factory (ESM hoists the mocked import above module consts, so the factory can't
 * reference outer variables).
 */
vi.mock('@/stores/connections', () => {
  const fakeAdapter = {
    protocol: 'mqtt',
    status: 'connected',
    subscribe() {},
    unsubscribe() {},
    onMessage() {},
    publish() {},
    send() {},
    request() {},
    executeTemplate() {},
    onStatusChange() {},
  }
  return {
    useConnectionsStore: () => ({
      getAdapter: (id: string) => (id === 'c1' ? fakeAdapter : null),
      connect: () => Promise.resolve(),
    }),
  }
})

import { resolveConnectionHandle, type ConnectionCapabilityContext } from '@/engine/connection'
import { setGrant, resetGrants } from '@/services/security/capabilityGrants'

const read = () => 'c1' // the selected connection id
const mqttOpts = { protocol: 'mqtt' }

describe('resolveConnectionHandle capability gate (steps 2 + 4)', () => {
  beforeEach(() => resetGrants()) // module singleton — clear grants between tests

  it('allows when no capability context is supplied (pre-step-2 / direct callers)', () => {
    expect(resolveConnectionHandle(read, mqttOpts)).not.toBeNull()
  })

  it('allows core + local nodes regardless of declaration (pre-trusted bypass)', () => {
    const core: ConnectionCapabilityContext = { nodeType: 'x', trust: 'core', declaredProtocols: [] }
    const local: ConnectionCapabilityContext = { nodeType: 'x', trust: 'local', declaredProtocols: [] }
    expect(resolveConnectionHandle(read, mqttOpts, core)).not.toBeNull()
    expect(resolveConnectionHandle(read, mqttOpts, local)).not.toBeNull()
  })

  it('DENIES a community node that did not declare the protocol (step 2)', () => {
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['websocket'] }
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull()
  })

  it('DENIES a declared community node until it is granted (step 4)', () => {
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['mqtt'] }
    // declared but no grant → denied (the default resolver denies)
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull()
  })

  it('ALLOWS a declared community node once the capability is granted (step 4)', () => {
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['mqtt'] }
    setGrant('x', 'connection:mqtt:c1', true) // key includes the specific connection id
    expect(resolveConnectionHandle(read, mqttOpts, cap)).not.toBeNull()
  })

  it('does not unlock a different connection of the same protocol (per-connection grant)', () => {
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['mqtt'] }
    setGrant('x', 'connection:mqtt:other', true) // a DIFFERENT broker was approved
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull() // c1 is still denied
  })

  it('keeps DENYING a declared community node whose grant was refused', () => {
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['mqtt'] }
    setGrant('x', 'connection:mqtt:c1', false)
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull()
  })

  it('gates on the resolved adapter protocol even when opts.protocol is omitted', () => {
    // No opts.protocol → still denied for a community node that didn't declare mqtt (the
    // adapter's actual protocol), closing the base-handle bypass.
    const cap: ConnectionCapabilityContext = { nodeType: 'x', trust: 'community', declaredProtocols: ['http'] }
    expect(resolveConnectionHandle(read, undefined, cap)).toBeNull()
  })
})
