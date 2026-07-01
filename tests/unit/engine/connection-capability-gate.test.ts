import { describe, it, expect, vi } from 'vitest'

/**
 * SECURITY_MODEL step 2 — the capability gate inside resolveConnectionHandle().
 *
 * A community node may only reach a connection whose protocol it DECLARED; core/local
 * nodes bypass (pre-trusted). Undeclared community access is denied (null handle). The
 * connections store is mocked so the test is pure (no broker / hardware). Everything the
 * mock needs is defined inside the factory (ESM hoists the mocked import above module
 * consts, so the factory can't reference outer variables).
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

const read = () => 'c1' // the selected connection id
const mqttOpts = { protocol: 'mqtt' }

describe('resolveConnectionHandle capability gate (step 2)', () => {
  it('allows when no capability context is supplied (pre-step-2 / direct callers)', () => {
    expect(resolveConnectionHandle(read, mqttOpts)).not.toBeNull()
  })

  it('allows core + local nodes regardless of declaration (pre-trusted bypass)', () => {
    const core: ConnectionCapabilityContext = { trust: 'core', declaredProtocols: [] }
    const local: ConnectionCapabilityContext = { trust: 'local', declaredProtocols: [] }
    expect(resolveConnectionHandle(read, mqttOpts, core)).not.toBeNull()
    expect(resolveConnectionHandle(read, mqttOpts, local)).not.toBeNull()
  })

  it('DENIES a community node that did not declare the protocol', () => {
    const cap: ConnectionCapabilityContext = { trust: 'community', declaredProtocols: ['websocket'] }
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull()
  })

  it('DENIES a community node with no declarations at all', () => {
    const cap: ConnectionCapabilityContext = { trust: 'community', declaredProtocols: [] }
    expect(resolveConnectionHandle(read, mqttOpts, cap)).toBeNull()
  })

  it('allows a community node that DID declare the protocol', () => {
    const cap: ConnectionCapabilityContext = { trust: 'community', declaredProtocols: ['mqtt'] }
    expect(resolveConnectionHandle(read, mqttOpts, cap)).not.toBeNull()
  })

  it('gates on the resolved adapter protocol even when opts.protocol is omitted', () => {
    // No opts.protocol → still denied for a community node that didn't declare mqtt (the
    // adapter's actual protocol), closing the base-handle bypass.
    const cap: ConnectionCapabilityContext = { trust: 'community', declaredProtocols: ['http'] }
    expect(resolveConnectionHandle(read, undefined, cap)).toBeNull()
  })
})
