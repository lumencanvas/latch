/**
 * `defineNodeState` — auto-registered per-node state with mandatory cleanup.
 *
 * Today every stateful executor hand-rolls a `Map<nodeId, State>` plus a
 * `gc<X>State(validIds)` and a `disposeAll<X>State()`, then wires all three into
 * `ExecutionEngine` by name (23 imports + 23 gc + 23 disposeAll). Forgetting any
 * one line is a silent resource leak — the recurring bug class in CLAUDE.md.
 *
 * `defineNodeState` creates the Map AND self-registers its cleanup into a central
 * registry the engine can drain generically, so a stateful node touches only its
 * own module and the leak class becomes structurally impossible.
 *
 * LIVE: the generic lifecycle loop is wired and authoritative — `ExecutionEngine`
 * registers every `defineNodeState`/`defineLifecycle` hook (`collectedLifecycles()`)
 * and drains their `gc(validNodeIds)` / `disposeAll()` on GC / stop. So a node's
 * cleanup registered here runs for real (it is NOT dead code). See
 * EXTENSIBILITY_ARCHITECTURE §4.
 */

/** A per-node state map with disposal built in. */
export interface NodeStateStore<T> {
  get(nodeId: string): T | undefined
  has(nodeId: string): boolean
  set(nodeId: string, state: T): void
  /** Get the existing entry or create + store one via `factory`. */
  getOrCreate(nodeId: string, factory: () => T): T
  /** Remove one entry, disposing it first. */
  delete(nodeId: string): void
  /** Dispose + drop every entry whose owning node id is not in `validNodeIds` (per-node GC). */
  gc(validNodeIds: Set<string>): void
  /** Dispose + drop all entries (engine stop / test reset). */
  disposeAll(): void
  entries(): IterableIterator<[string, T]>
  readonly size: number
}

/** The cleanup surface the engine drains generically. */
export interface LifecycleHooks {
  label: string
  /** Dispose + drop every entry whose node id is not in `validNodeIds`. */
  gc(validNodeIds: Set<string>): void
  /** Dispose + drop all entries (engine stop()). */
  disposeAll(): void
  /** Optional end-of-frame hook (replaces the off-pattern `endMessagingFrame`). */
  endFrame?(): void
  /** Optional start hook (replaces `resetAINodeDisposal`/`resetOpenCVNodeDisposal`). */
  onStart?(): void
}

export interface DefineNodeStateOptions<T> {
  /** Tear down one entry (e.g. dispose a Tone node, close a socket, kill a worker). */
  dispose?(state: T, nodeId: string): void
  /** Called once when the engine starts. */
  onStart?(): void
  /** Called at the end of each frame. */
  endFrame?(): void
  /**
   * Map a (possibly suffixed) state key back to its owning node id so `gc` keeps
   * entries for live nodes. Defaults to identity (the key *is* the node id).
   */
  keyToNodeId?(key: string): string
  /** Human-readable label for diagnostics. */
  label?: string
}

// Central registry the engine reads once (via a future `registerLifecycles`).
// The engine never imports this module; it only stores the returned array — so
// there is no circular dependency and HMR fan-out stays bounded.
const lifecycles: LifecycleHooks[] = []

/**
 * Create a per-node state store whose cleanup is automatically registered.
 */
export function defineNodeState<T>(opts: DefineNodeStateOptions<T> = {}): NodeStateStore<T> {
  const map = new Map<string, T>()
  const keyToNodeId = opts.keyToNodeId ?? ((k: string) => k)
  const dispose = opts.dispose

  const disposeEntry = (key: string): void => {
    const state = map.get(key)
    if (state === undefined && !map.has(key)) return
    if (dispose) dispose(state as T, key)
    map.delete(key)
  }

  const gc = (validNodeIds: Set<string>): void => {
    for (const key of [...map.keys()]) {
      if (!validNodeIds.has(keyToNodeId(key))) disposeEntry(key)
    }
  }

  const disposeAll = (): void => {
    for (const key of [...map.keys()]) disposeEntry(key)
  }

  const store: NodeStateStore<T> = {
    get: (nodeId) => map.get(nodeId),
    has: (nodeId) => map.has(nodeId),
    set: (nodeId, state) => {
      map.set(nodeId, state)
    },
    getOrCreate: (nodeId, factory) => {
      let s = map.get(nodeId)
      if (s === undefined && !map.has(nodeId)) {
        s = factory()
        map.set(nodeId, s)
      }
      return s as T
    },
    delete: (nodeId) => disposeEntry(nodeId),
    gc,
    disposeAll,
    entries: () => map.entries(),
    get size() {
      return map.size
    },
  }

  // The engine drains these generically; they delegate to the same store methods
  // tests can call directly, so a category needs no bespoke gc/disposeAll function.
  lifecycles.push({
    label: opts.label ?? 'nodeState',
    gc,
    disposeAll,
    endFrame: opts.endFrame,
    onStart: opts.onStart,
  })

  return store
}

/**
 * Register a lifecycle hook NOT backed by a `defineNodeState` map — for cleanup
 * that is a side effect rather than per-node state (e.g. a service-level
 * `gc(validNodeIds)`/`stopActive()`, or a message bus `clear()`/end-of-frame
 * flush). Joins the same generic loop the engine drains. `gc`/`disposeAll`
 * default to no-ops so callers only provide the hooks they need.
 */
export function defineLifecycle(hook: {
  label: string
  gc?: (validNodeIds: Set<string>) => void
  disposeAll?: () => void
  endFrame?: () => void
  onStart?: () => void
}): void {
  lifecycles.push({
    label: hook.label,
    gc: hook.gc ?? (() => {}),
    disposeAll: hook.disposeAll ?? (() => {}),
    endFrame: hook.endFrame,
    onStart: hook.onStart,
  })
}

/** The lifecycle hooks of every `defineNodeState` created so far (engine reads once). */
export function collectedLifecycles(): readonly LifecycleHooks[] {
  return lifecycles
}

/** Test-only: clear the registry so suites don't accumulate hooks across cases. */
export function _resetLifecyclesForTest(): void {
  lifecycles.length = 0
}
