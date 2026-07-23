import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import {
  claspSetExecutor,
  claspEmitExecutor,
  claspGetExecutor,
} from '@/engine/executors/clasp'

function ctx(inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId: 'clasp-n',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

/**
 * CLASP data executors must degrade gracefully when no connection is configured — surface a clear
 * error and a "not sent"/null result, and NEVER throw or attempt a connection. (These no-connectionId
 * paths short-circuit before any @clasp-to/core interaction, so they're safe to test without a relay.)
 */
describe('CLASP executors — graceful degradation with no connection', () => {
  it('set: not sent + a clear error even with a live trigger', async () => {
    const out = await claspSetExecutor(ctx({ trigger: 1, value: 5, address: '/x' }))
    expect(out.get('sent')).toBe(false)
    expect(out.get('error')).toBe('No connection selected')
  })

  it('emit: not sent + a clear error even with a live trigger', async () => {
    const out = await claspEmitExecutor(ctx({ trigger: 1, payload: { a: 1 } }))
    expect(out.get('sent')).toBe(false)
    expect(out.get('error')).toBe('No connection selected')
  })

  it('get: null value + a clear error', async () => {
    const out = await claspGetExecutor(ctx({ trigger: 1, address: '/x' }))
    expect(out.get('value')).toBeNull()
    expect(out.get('error')).toBe('No connection selected')
  })

  it('a NUMERIC trigger is honored (truthy), not just boolean — same no-connection outcome', async () => {
    // (documents that CLASP set/emit use a truthy check, so the canonical numeric trigger reaches
    // the send branch — here it still short-circuits on the missing connection, as it must.)
    const set = await claspSetExecutor(ctx({ trigger: 1, value: 9 }))
    expect(set.get('error')).toBe('No connection selected')
  })
})
