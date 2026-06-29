import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRuntimeStore } from '@/stores/runtime'

/**
 * Per-node error metrics that drive the BaseNode error badge. The badge keys off
 * metrics.lastError, so the store must: record errors even on a node's first-ever
 * (failed) execution, clear lastError when the node next succeeds, and keep the
 * cumulative errorCount + errors[] history intact.
 */
describe('runtime store node error metrics', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addError records on a node that never executed (first-frame failure)', () => {
    const store = useRuntimeStore()
    store.addError({ nodeId: 'n1', message: 'boom', timestamp: 1 })

    expect(store.getNodeMetrics('n1')?.lastError).toBe('boom')
    expect(store.getNodeMetrics('n1')?.errorCount).toBe(1)
  })

  it('a successful execution clears lastError but keeps errorCount and history', () => {
    const store = useRuntimeStore()
    store.addError({ nodeId: 'n1', message: 'boom', timestamp: 1 })

    store.updateNodeMetrics('n1', { lastExecutionTime: 2 })

    expect(store.getNodeMetrics('n1')?.lastError).toBeNull()
    expect(store.getNodeMetrics('n1')?.errorCount).toBe(1) // cumulative preserved
    expect(store.errors.length).toBe(1) // error log untouched
  })

  it('re-erroring after a recovery sets lastError again', () => {
    const store = useRuntimeStore()
    store.updateNodeMetrics('n1', { lastExecutionTime: 1 }) // healthy first run
    expect(store.getNodeMetrics('n1')?.lastError).toBeNull()

    store.addError({ nodeId: 'n1', message: 'again', timestamp: 2 })
    expect(store.getNodeMetrics('n1')?.lastError).toBe('again')
    expect(store.getNodeMetrics('n1')?.errorCount).toBe(1)
  })

  it('recordNodeError also records on an unseen node', () => {
    const store = useRuntimeStore()
    store.recordNodeError('n2', 'Node 2', 'oops')

    expect(store.getNodeMetrics('n2')?.lastError).toBe('oops')
    expect(store.getNodeMetrics('n2')?.errorCount).toBe(1)
  })
})
