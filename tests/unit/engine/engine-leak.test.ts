import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Node } from '@vue-flow/core'
import { ExecutionEngine } from '@/engine/ExecutionEngine'
import { defineNodeState, collectedLifecycles } from '@/engine/nodeState'
import { risingEdge } from '@/engine/trigger'

// Every state group already migrated to `defineNodeState` (Phase 1). The index-barrel
// groups come from '@/engine/executors'; the per-category files export their own stores.
import {
  triggerPrevPressed,
  smoothState,
  gateLastValue,
  startFiredNodes,
  intervalState,
  delayState,
  timerState,
  metronomeState,
  stepSequencerState,
  consolePrevValues,
  monitorLastValue,
  scopeAnalyzers,
  eqAnalyzers,
  vectorMemoryStores,
  llmTriggerPrev,
  llmPrevStatus,
} from '@/engine/executors'
import { springState } from '@/engine/executors/spring'
import { signalState, tapState } from '@/engine/executors/signal'
import { gamepadState } from '@/engine/executors/gamepad'
import { sendPrevValues, activeReceiveNodes } from '@/engine/executors/messaging'
import {
  changedPrevValue,
  sampleHoldValue,
  latchState,
  counterState,
  debounceState,
  throttleState,
} from '@/engine/executors/utility'
import { wsState, nodeListeners } from '@/engine/executors/websocket'
import { mqttState, nodeSubscriptions } from '@/engine/executors/mqtt'

/**
 * Engine-level leak gate (ROADMAP Phase 1: "per-type create+delete leak test").
 *
 * The per-category unit tests in `executor-gc.test.ts` already pin each store's
 * `gc`/`disposeAll` *in isolation* (calling `store.gc(...)` directly). This file
 * pins the missing half: that the **engine itself** drives that cleanup through its
 * generic `for (const l of this.lifecycles) …` loops — i.e. that every converted
 * store is reachable from `collectedLifecycles()` and is drained when a node is
 * removed via `updateGraph` and when the engine `stop()`s. If a future store is
 * added with `defineNodeState` but never reaches the engine, the coverage test
 * below fails; if the engine wiring regresses, the probe test fails.
 */

// Minimal node — updateGraph only reads `id` (and `data.nodeType`); no executor needed.
function node(id: string): Node {
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { nodeType: 'noop' } } as unknown as Node
}

// Minimal seedable view of a store so heterogeneous generic types share one list.
interface SeedableStore {
  set(nodeId: string, state: unknown): void
  disposeAll(): void
  readonly size: number
}

// Analyser stores carry a `dispose` that reads `s.waveform`/`s.fft` (null-safe via
// `disposeAnalyzer`), so a `{}` seed disposes cleanly. Every other store is a plain
// cache/value with no dispose, so the seed shape is irrelevant.
const CONVERTED_STORES: Array<{ name: string; store: SeedableStore }> = [
  { name: 'spring', store: springState as unknown as SeedableStore },
  { name: 'signal', store: signalState as unknown as SeedableStore },
  { name: 'tap', store: tapState as unknown as SeedableStore },
  { name: 'gamepad', store: gamepadState as unknown as SeedableStore },
  { name: 'send', store: sendPrevValues as unknown as SeedableStore },
  { name: 'activeReceive', store: activeReceiveNodes as unknown as SeedableStore },
  { name: 'changed', store: changedPrevValue as unknown as SeedableStore },
  { name: 'sampleHold', store: sampleHoldValue as unknown as SeedableStore },
  { name: 'latch', store: latchState as unknown as SeedableStore },
  { name: 'counter', store: counterState as unknown as SeedableStore },
  { name: 'debounce', store: debounceState as unknown as SeedableStore },
  { name: 'throttle', store: throttleState as unknown as SeedableStore },
  { name: 'triggerPrevPressed', store: triggerPrevPressed as unknown as SeedableStore },
  { name: 'smooth', store: smoothState as unknown as SeedableStore },
  { name: 'gate', store: gateLastValue as unknown as SeedableStore },
  { name: 'startFired', store: startFiredNodes as unknown as SeedableStore },
  { name: 'interval', store: intervalState as unknown as SeedableStore },
  { name: 'delay', store: delayState as unknown as SeedableStore },
  { name: 'timer', store: timerState as unknown as SeedableStore },
  { name: 'metronome', store: metronomeState as unknown as SeedableStore },
  { name: 'stepSequencer', store: stepSequencerState as unknown as SeedableStore },
  { name: 'console', store: consolePrevValues as unknown as SeedableStore },
  { name: 'monitor', store: monitorLastValue as unknown as SeedableStore },
  { name: 'scopeAnalyzers', store: scopeAnalyzers as unknown as SeedableStore },
  { name: 'eqAnalyzers', store: eqAnalyzers as unknown as SeedableStore },
  { name: 'vectorMemory', store: vectorMemoryStores as unknown as SeedableStore },
  { name: 'llmTrigger', store: llmTriggerPrev as unknown as SeedableStore },
  { name: 'llmStatus', store: llmPrevStatus as unknown as SeedableStore },
  { name: 'wsState', store: wsState as unknown as SeedableStore },
  { name: 'mqttState', store: mqttState as unknown as SeedableStore },
  // nodeListeners / nodeSubscriptions are NOT in this {}-seeded list — their dispose
  // calls .unsubscribe(), which a bare {} lacks. They get dedicated real-teardown tests.
]

describe('engine leak gate', () => {
  let engine: ExecutionEngine

  beforeEach(() => {
    setActivePinia(createPinia())
    engine = new ExecutionEngine()
    // Reset EVERY registered lifecycle — not just the 28 exported stores, but also the
    // non-exported converted stores (edgeState/code/http) and any probe — so state never
    // bleeds between cases.
    collectedLifecycles().forEach((l) => l.disposeAll())
    // Wire the generic lifecycle loops exactly as production does (live array ref).
    engine.registerLifecycles(collectedLifecycles())
  })

  it('mocks canvas.getContext(2d) for headless visual-gc paths', () => {
    // Prerequisite for exercising the still-hand-wired gcVisualState (heavy tier) once
    // visual is converted — happy-dom leaves getContext undefined. See tests/setup.ts.
    const ctx = document.createElement('canvas').getContext('2d')
    expect(ctx).not.toBeNull()
    expect(() => (ctx as CanvasRenderingContext2D).save()).not.toThrow()
    expect(document.createElement('canvas').getContext('webgl')).toBeNull()
  })

  it('updateGraph removal drains every converted store via the engine gc loop', () => {
    engine.updateGraph([node('n1')], [])
    CONVERTED_STORES.forEach(({ store }) => store.set('n1', {}))
    CONVERTED_STORES.forEach(({ name, store }) => expect(store.size, name).toBe(1))

    // Remove n1: hasRemovedNodes → the generic `for (const l of this.lifecycles)
    // l.gc(validNodeIds)` loop runs. No direct store.gc() call here.
    engine.updateGraph([], [])

    CONVERTED_STORES.forEach(({ name, store }) => expect(store.size, name).toBe(0))
  })

  it('keeps live nodes while dropping only removed ones', () => {
    engine.updateGraph([node('keep'), node('drop')], [])
    CONVERTED_STORES.forEach(({ store }) => {
      store.set('keep', {})
      store.set('drop', {})
    })

    engine.updateGraph([node('keep')], []) // 'drop' removed

    CONVERTED_STORES.forEach(({ name, store }) => expect(store.size, name).toBe(1))
  })

  it('stop() disposes every converted store', () => {
    engine.updateGraph([node('n1')], [])
    CONVERTED_STORES.forEach(({ store }) => store.set('n1', {}))

    engine.stop()

    CONVERTED_STORES.forEach(({ name, store }) => expect(store.size, name).toBe(0))
  })

  it('drains a freshly-registered defineNodeState store and fires its dispose (custom-node path)', () => {
    // A store created after the engine started must still be cleaned: registerLifecycles
    // stored the live array, so late registrations are seen. This is the guarantee that
    // a user/custom executor importing defineNodeState inherits auto-cleanup for free.
    const probe = defineNodeState<{ disposed: boolean }>({
      label: 'leak-probe',
      dispose: (s) => {
        s.disposed = true
      },
    })

    engine.updateGraph([node('p1')], [])
    const state = { disposed: false }
    probe.set('p1', state)
    expect(probe.size).toBe(1)

    engine.updateGraph([], []) // remove p1

    expect(probe.size).toBe(0)
    expect(state.disposed).toBe(true) // the engine gc loop invoked dispose(), not just dropped the entry
  })

  it('honors keyToNodeId for compound-keyed stores end-to-end through the engine', () => {
    // None of the exported stores use compound keys, but `code`/`http` do (non-exported).
    // Prove the engine's gc loop resolves the owning node id from a suffixed key so a
    // removed node's per-key state is dropped while a live node's is kept.
    const probe = defineNodeState<number>({
      label: 'leak-probe-compound',
      keyToNodeId: (k) => k.split(':')[0],
    })

    engine.updateGraph([node('keep'), node('drop')], [])
    probe.set('keep:a', 1)
    probe.set('keep:b', 2)
    probe.set('drop:a', 3)
    expect(probe.size).toBe(3)

    engine.updateGraph([node('keep')], []) // 'drop' removed

    expect(probe.size).toBe(2) // both 'keep:*' survive; 'drop:a' dropped
  })

  it('gc-s the non-exported `::`-keyed edge state (trigger.ts) on removal, end-to-end', () => {
    // edgeState (risingEdge) is a converted store with a UNIQUE keyToNodeId (`indexOf('::')`)
    // that no other store/probe exercises, and it is non-exported so it can't be seeded
    // directly. Drive it through the exported risingEdge() and observe cleanup behaviorally:
    // a removed node's held-high input must read as a FRESH rising edge again (state gone),
    // while a live node stays latched (state kept).
    engine.updateGraph([node('keep'), node('drop')], [])
    expect(risingEdge('keep', 'trigger', 1)).toBe(true) // initial low→high edge
    expect(risingEdge('keep', 'trigger', 1)).toBe(false) // held high → no re-fire (state retained)
    expect(risingEdge('drop', 'trigger', 1)).toBe(true)
    expect(risingEdge('drop', 'trigger', 1)).toBe(false)

    engine.updateGraph([node('keep')], []) // 'drop' removed → engine gc loop runs edgeState.gc

    expect(risingEdge('drop', 'trigger', 1)).toBe(true) // state gc'd → fires again (cleanup proven)
    expect(risingEdge('keep', 'trigger', 1)).toBe(false) // state retained → still latched (selectivity)
  })

  it('fires the real teardown (websocket unsubscribe) when the engine gc-s a removed node', () => {
    // The heavy-tier payoff: the websocket nodeListeners store's dispose callback IS
    // the resource release (unsubscribe from the adapter). Prove the engine's gc loop
    // invokes it on removal — and only for the removed node.
    const keepUnsub = vi.fn()
    const dropUnsub = vi.fn()
    engine.updateGraph([node('keep'), node('drop')], [])
    nodeListeners.set('keep', { connectionId: 'c', unsubscribe: keepUnsub })
    nodeListeners.set('drop', { connectionId: 'c', unsubscribe: dropUnsub })

    engine.updateGraph([node('keep')], []) // 'drop' removed

    expect(dropUnsub).toHaveBeenCalledTimes(1) // removed node's listener released
    expect(keepUnsub).not.toHaveBeenCalled() // live node's listener untouched
    expect(nodeListeners.size).toBe(1)

    engine.stop() // teardown releases the rest
    expect(keepUnsub).toHaveBeenCalledTimes(1)
    expect(nodeListeners.size).toBe(0)
  })

  it('fires the real teardown (mqtt unsubscribe) when the engine gc-s a removed node', () => {
    // mqtt's nodeSubscriptions dispose unsubscribes the message listener (the adapter
    // unsubscribe is best-effort and a no-op with no connections store wired). Prove the
    // engine releases the removed node's subscription and leaves the live one alone.
    const keepUnsub = vi.fn()
    const dropUnsub = vi.fn()
    engine.updateGraph([node('keep'), node('drop')], [])
    nodeSubscriptions.set('keep', { connectionId: 'c', topic: 't', unsubscribe: keepUnsub })
    nodeSubscriptions.set('drop', { connectionId: 'c', topic: 't', unsubscribe: dropUnsub })

    engine.updateGraph([node('keep')], []) // 'drop' removed

    expect(dropUnsub).toHaveBeenCalledTimes(1)
    expect(keepUnsub).not.toHaveBeenCalled()
    expect(nodeSubscriptions.size).toBe(1)

    engine.stop()
    expect(keepUnsub).toHaveBeenCalledTimes(1)
    expect(nodeSubscriptions.size).toBe(0)
  })

  it('asymmetric/marker categories self-register via defineLifecycle (opencv, ai, emulation)', () => {
    // These cannot be defineNodeState stores (gc/disposeAll differ — marker Sets that
    // survive gc and clear only onStart). They self-register their existing functions so
    // the engine's generic loop drives them. Guard that the registration is present and
    // fully wired (the engine drains gc/disposeAll/onStart generically — see
    // ExecutionEngine.test.ts's lifecycle spy).
    for (const label of ['opencv', 'ai', 'emulation']) {
      const hook = collectedLifecycles().find((l) => l.label === label)
      expect(hook, `${label} lifecycle not registered`).toBeDefined()
      expect(typeof hook!.gc).toBe('function')
      expect(typeof hook!.disposeAll).toBe('function')
    }
    // opencv + ai additionally provide the onStart marker reset (stop→restart guard).
    for (const label of ['opencv', 'ai']) {
      const hook = collectedLifecycles().find((l) => l.label === label)
      expect(typeof hook!.onStart, `${label} missing onStart`).toBe('function')
    }
  })
})
