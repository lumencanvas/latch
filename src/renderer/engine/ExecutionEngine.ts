import type { Node, Edge } from '@vue-flow/core'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { risingEdge, isHigh } from './trigger'
import { resolveConnectionHandle, type ConnectionCapabilityContext } from './connection'
import { nodeTrust } from '@/services/security/trust'
import type { ConnectionHandle } from '@/services/connections/ConnectionHandle'
import type { LifecycleHooks } from './nodeState'
// Every stateful executor category now self-registers its cleanup with the engine's
// generic lifecycle loop — via defineNodeState (auto gc/dispose) or defineLifecycle
// (audio, visual, 3d, connectivity, clasp, ai, opencv, emulation, webllm: ordering-
// sensitive / marker / asymmetric teardown, wrapped behavior-identically). The engine
// hand-wires no category except subflow, which is deferred to its Phase-7 rebuild.
import { clearAllSubflowContexts, gcSubflowState } from './executors/subflow'
// opencv state self-registers via defineLifecycle (asymmetric marker Set + onStart reset) — generic loop.

/**
 * Largest delta (seconds) a single frame may report. Caps the time spike that
 * would otherwise occur after the tab was backgrounded, a breakpoint paused
 * execution, or the machine slept — preventing time/LFO/physics nodes from
 * jumping forward by seconds in one frame.
 */
export const MAX_FRAME_DELTA = 0.25

/**
 * Pure FPS-cap gate: should a frame execute now given the last execution time
 * and the target fps? `targetFps <= 0` means uncapped (always execute). The 1ms
 * tolerance prevents a 60fps cap from skipping every other frame due to rAF
 * timestamp jitter.
 */
export function shouldRenderFrame(now: number, lastRenderTime: number, targetFps: number): boolean {
  if (targetFps <= 0) return true
  const interval = 1000 / targetFps
  return now - lastRenderTime >= interval - 1
}

/** Pure delta clamp — see {@link MAX_FRAME_DELTA}. */
export function clampDelta(deltaSeconds: number, max: number = MAX_FRAME_DELTA): number {
  return deltaSeconds > max ? max : deltaSeconds
}

export type ExecutionMode = 'full' | 'dirty'

/**
 * Node types whose executor is a verified PURE function of (inputs, controls):
 * no module-level state, no time (`ctx.deltaTime`/`totalTime`/`frameCount`), no
 * randomness, no side effects. Only these may be SKIPPED in dirty mode when their
 * inputs and controls are unchanged. Everything else always runs (safe default —
 * a misclassification can never freeze a node, only forgo a speedup).
 *
 * Verified by direct reading of `engine/executors/index.ts` (2026-06-14). Notable
 * exclusions: `gate` (module state), `smooth` (deltaTime), `random` (Math.random),
 * and all timing/stateful nodes. See docs/AUDIT_2026-06-14.md. Grow this set only
 * after reading the executor.
 */
export const PURE_NODE_TYPES: ReadonlySet<string> = new Set([
  'constant',
  'add', 'subtract', 'multiply', 'divide',
  'map-range', 'clamp', 'abs', 'trig', 'atan2', 'power', 'vector-math', 'modulo',
  'min', 'max',
  'lerp', 'step', 'smoothstep', 'remap', 'quantize', 'wrap',
  'compare', 'and', 'or', 'not', 'select', 'switch',
])

/**
 * Result of executing a node
 */
export interface ExecutionResult {
  nodeId: string
  outputs: Map<string, unknown>
  error?: Error
  duration: number
}

/**
 * Context passed to node executors
 */
export interface ExecutionContext {
  nodeId: string
  inputs: Map<string, unknown>
  controls: Map<string, unknown>
  definition: NodeDefinition
  deltaTime: number
  totalTime: number
  frameCount: number
  /** input ?? control ?? fallback, coerced to a finite number (NaN/±Infinity → fallback). */
  num(id: string, fallback?: number): number
  /** input ?? control ?? fallback, coerced to a boolean. */
  bool(id: string, fallback?: boolean): boolean
  /** input ?? control ?? fallback, coerced to a string. */
  str(id: string, fallback?: string): string
  /** Rising edge (low→high transition) of an input/control this frame (= risingEdge). */
  trig(id: string): boolean
  /** Whether an input/control is currently high (= isHigh). */
  level(id: string): boolean
  /**
   * Resolve the no-secret {@link ConnectionHandle} for this node's selected
   * connection (the broker holds the credential), auto-connecting with a shared
   * throttle. Returns `null` when unselected / unavailable / protocol mismatch.
   */
  connection<T extends ConnectionHandle = ConnectionHandle>(
    opts?: { controlId?: string; protocol?: string }
  ): T | null
}

/** The plain data fields of a context; the typed accessors are added by the factory. */
export type ExecutionContextData = Omit<
  ExecutionContext,
  'num' | 'bool' | 'str' | 'trig' | 'level' | 'connection'
>

/**
 * Build an {@link ExecutionContext} with the typed input accessors wired up. The
 * production construction site and any test that needs a context should go through
 * this so executors can rely on `ctx.num/bool/str/trig/level` (EXTENSIBILITY §5.2).
 * Accessors read `input ?? control` for the given id, then fall back to the
 * supplied default. Additive: raw `ctx.inputs.get()` keeps working unchanged.
 */
export function createExecutionContext(
  data: ExecutionContextData,
  cap?: ConnectionCapabilityContext
): ExecutionContext {
  // `cap` is CLOSED OVER, never placed on the returned ctx — so an executor (esp. an
  // untrusted community one) can't reach or mutate its own trust tier to spoof `core`
  // and bypass the capability gate (SECURITY_MODEL step 2; audit finding).
  const read = (id: string): unknown => {
    const fromInput = data.inputs.get(id)
    return fromInput !== undefined ? fromInput : data.controls.get(id)
  }
  return {
    ...data,
    num(id, fallback = 0) {
      const v = read(id)
      const n =
        typeof v === 'number' ? v
        : typeof v === 'boolean' ? (v ? 1 : 0)
        : typeof v === 'string' ? parseFloat(v)
        : NaN
      return Number.isFinite(n) ? n : fallback
    },
    bool(id, fallback = false) {
      const v = read(id)
      if (v === undefined || v === null) return fallback
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      if (typeof v === 'string') return v === 'true' || v === '1'
      return Boolean(v)
    },
    str(id, fallback = '') {
      const v = read(id)
      if (v === undefined || v === null) return fallback
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      return fallback
    },
    trig(id) {
      return risingEdge(data.nodeId, id, read(id))
    },
    level(id) {
      return isHigh(read(id))
    },
    connection<T extends ConnectionHandle = ConnectionHandle>(opts?: {
      controlId?: string
      protocol?: string
    }): T | null {
      return resolveConnectionHandle<T>(read, opts, cap)
    },
  }
}

/**
 * Node executor function type
 */
export type NodeExecutorFn = (ctx: ExecutionContext) => Promise<Map<string, unknown>> | Map<string, unknown>

/**
 * Coerce an input value to its target port's declared primitive type. Honors the
 * connection matrix's promised number/boolean/string coercions
 * (`utils/connections.ts`: number→{string,boolean}, boolean→{number,string}) that
 * the engine previously skipped — e.g. a boolean into a `number` port arrived as
 * `true`, so `true + 0 === 1` and `?? 0` never caught it (the "coercion lie",
 * AUDIT §D). Conservative: only primitive number/boolean/string targets are
 * coerced, and only when the value's runtime type mismatches; `any`, trigger,
 * textures, 3D types, `data`, and unknown/placeholder ports pass through untouched.
 */
export function coerceToPortType(value: unknown, portType: string | undefined): unknown {
  switch (portType) {
    case 'number':
      return typeof value === 'boolean' ? (value ? 1 : 0) : value
    case 'boolean':
      return typeof value === 'number' ? value !== 0 : value
    case 'string':
      return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value
    default:
      return value
  }
}

/**
 * Execution engine for running flow graphs
 */
export class ExecutionEngine {
  private nodes: Node[] = []
  private nodeById: Map<string, Node> = new Map()
  private edges: Edge[] = []
  private executionOrder: string[] = []
  /** target nodeId -> source nodeIds (incoming adjacency), for dirty-mode change propagation. */
  private sourcesByTarget: Map<string, string[]> = new Map()

  // --- Change-driven (dirty) execution (Phase 2) ---
  private executionMode: ExecutionMode = 'full'
  /** Last-seen control snapshot per node, to detect control edits between frames. */
  private prevControlSnapshots: Map<string, Map<string, unknown>> = new Map()
  /** Number of nodes actually executed in the most recent frame (for diagnostics/tests). */
  private lastFrameExecutedCount: number = 0

  // --- Deferred (fire-and-latch) async execution (Phase 2) ---
  /**
   * Node types whose async executor should NOT block the frame: the engine kicks
   * off the work, serves the last cached outputs immediately, and applies the
   * result when it resolves. Intended for long, occasionally-triggered I/O
   * (HTTP, heavy generative inference) — NOT per-frame async nodes like MediaPipe
   * or webcam, which intentionally await their result each frame. Empty by
   * default (no behavior change until a type is opted in).
   */
  private deferredNodeTypes: Set<string> = new Set()
  /** Deferred node ids with an async op currently in flight (prevents request storms). */
  private inFlightAsync: Set<string> = new Set()
  /** Deferred node ids whose result landed out-of-band, for dirty-mode propagation. */
  private pendingAsyncChange: Set<string> = new Set()
  /** Whether late async results may still be applied (false after stop()). */
  private acceptAsyncResults: boolean = true
  private nodeOutputs: Map<string, Map<string, unknown>> = new Map()
  private executors: Map<string, NodeExecutorFn> = new Map()
  private animationFrameId: number | null = null
  private startTime: number = 0
  private lastFrameTime: number = 0
  private frameCount: number = 0
  private runtimeStore = useRuntimeStore()
  private nodesStore = useNodesStore()
  /**
   * Generic per-node-state lifecycles (from `defineNodeState`), drained alongside
   * the legacy hardcoded `gc*`/`disposeAll*` calls. Empty until
   * `registerLifecycles()` is called, so this is a no-op until a consumer exists.
   */
  private lifecycles: readonly LifecycleHooks[] = []

  // --- Render-loop lifecycle (Phase 1) ---
  /** Target frames per second; 0 = uncapped (run at the display refresh rate). */
  private targetFps: number = 0
  /** Timestamp of the last executed frame, for the FPS-cap gate. */
  private lastRenderTime: number = 0
  /** True when the loop was paused because the tab/document was hidden. */
  private autoPausedByVisibility: boolean = false
  /** Bound visibility handler; stored so it can be removed. */
  private visibilityHandler: (() => void) | null = null
  /**
   * Monotonic token identifying the currently-active loop. Any loop whose
   * captured token no longer matches must not re-arm. This prevents a second
   * concurrent loop if the loop is paused (stop/pause/hidden) during the async
   * `await executeFrame()` gap and then resumed.
   */
  private loopToken: number = 0

  /**
   * Register a node executor
   */
  registerExecutor(nodeType: string, executor: NodeExecutorFn): void {
    this.executors.set(nodeType, executor)
  }

  /**
   * Unregister a node executor
   */
  unregisterExecutor(nodeType: string): void {
    this.executors.delete(nodeType)
  }

  /**
   * Register the generic per-node-state lifecycles (from `collectedLifecycles()`).
   * Stored by reference so late `defineNodeState` registrations are still seen; the
   * engine never imports `nodeState` itself, keeping it free of that dependency.
   */
  registerLifecycles(hooks: readonly LifecycleHooks[]): void {
    this.lifecycles = hooks
  }

  /**
   * Update the graph (nodes and edges)
   */
  updateGraph(nodes: Node[], edges: Edge[]): void {
    // Get current valid node IDs for GC
    const validNodeIds = new Set(nodes.map(n => n.id))

    // If we had previous nodes, GC any that were removed
    if (this.nodes.length > 0) {
      const previousNodeIds = new Set(this.nodes.map(n => n.id))
      const hasRemovedNodes = [...previousNodeIds].some(id => !validNodeIds.has(id))

      if (hasRemovedNodes) {
        // Run garbage collection for orphaned state. subflow is the last hand-wired
        // category (deferred to Phase 7); every other category is drained by the
        // generic lifecycle loop below.
        gcSubflowState(validNodeIds)
        // Clean up node metrics for deleted nodes
        this.runtimeStore.gcNodeMetrics(validNodeIds)
        // Generic defineNodeState / defineLifecycle cleanup.
        for (const l of this.lifecycles) l.gc(validNodeIds)
        // Drop dirty-mode / async tracking for removed nodes
        for (const id of this.prevControlSnapshots.keys()) {
          if (!validNodeIds.has(id)) this.prevControlSnapshots.delete(id)
        }
        for (const id of this.pendingAsyncChange) {
          if (!validNodeIds.has(id)) this.pendingAsyncChange.delete(id)
        }
      }
    }

    this.nodes = nodes
    // Rebuild the id->node lookup so executeFrame() can resolve nodes in O(1)
    // instead of an O(n) Array.find() per node (O(n^2) per frame).
    this.nodeById = new Map(nodes.map((n) => [n.id, n]))
    this.edges = edges
    // Incoming adjacency (target -> sources) for dirty-mode change propagation.
    this.sourcesByTarget = new Map()
    for (const edge of edges) {
      const arr = this.sourcesByTarget.get(edge.target)
      if (arr) arr.push(edge.source)
      else this.sourcesByTarget.set(edge.target, [edge.source])
    }
    this.executionOrder = this.topologicalSort()
  }

  /**
   * Perform topological sort to determine execution order
   * Uses Kahn's algorithm
   */
  private topologicalSort(): string[] {
    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    // Initialize
    for (const node of this.nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    // Build graph from edges
    for (const edge of this.edges) {
      const neighbors = adjacency.get(edge.source) ?? []
      neighbors.push(edge.target)
      adjacency.set(edge.source, neighbors)

      const degree = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, degree + 1)
    }

    // Find all nodes with no incoming edges
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId)
      }
    }

    // Process queue
    const result: string[] = []
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      result.push(nodeId)

      const neighbors = adjacency.get(nodeId) ?? []
      for (const neighbor of neighbors) {
        const degree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, degree)
        if (degree === 0) {
          queue.push(neighbor)
        }
      }
    }

    // Check for cycles
    if (result.length !== this.nodes.length) {
      console.warn('Graph contains cycles, some nodes will not be executed')
    }

    return result
  }

  /**
   * Get inputs for a node from connected outputs
   */
  private getNodeInputs(nodeId: string): Map<string, unknown> {
    const inputs = new Map<string, unknown>()

    // Resolve the target node's declared input types once, so each value can be
    // coerced to its port's type at the boundary (the connection matrix promises
    // number/boolean/string coercion the engine otherwise never performed).
    const targetType = this.nodeById.get(nodeId)?.data?.nodeType as string | undefined
    const targetDef = targetType ? this.nodesStore.getDefinition(targetType) : undefined

    // Find all edges that target this node
    for (const edge of this.edges) {
      if (edge.target === nodeId && edge.targetHandle && edge.sourceHandle) {
        const sourceOutputs = this.nodeOutputs.get(edge.source)
        if (sourceOutputs) {
          const value = sourceOutputs.get(edge.sourceHandle)
          if (value !== undefined) {
            const portType = targetDef?.inputs.find((p) => p.id === edge.targetHandle)?.type
            inputs.set(edge.targetHandle, coerceToPortType(value, portType))
          }
        }
      }
    }

    return inputs
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: Node, deltaTime: number): Promise<ExecutionResult> {
    const startTime = performance.now()
    const nodeType = node.data?.nodeType as string
    // Resolve the definition from the embedded copy if present (legacy/new nodes
    // still carry one), else from the registry by type. The `.latch` v2 format
    // drops the stale embedded definition (FILE_FORMAT_SPEC), so imported flows
    // rely on registry resolution to populate control defaults below.
    const definition =
      (node.data?.definition as NodeDefinition | undefined) ?? this.nodesStore.getDefinition(nodeType)

    // Get executor
    const executor = this.executors.get(nodeType)
    if (!executor) {
      return {
        nodeId: node.id,
        outputs: new Map(),
        duration: 0,
      }
    }

    // Build context
    // Controls are stored directly in node.data, not in node.data.controls
    // Start with defaults from definition, then override with actual values
    const controlEntries: [string, unknown][] = []

    // First, populate defaults from definition
    if (definition?.controls) {
      for (const control of definition.controls) {
        if (control.default !== undefined) {
          controlEntries.push([control.id, control.default])
        }
      }
    }

    // Then override with actual node.data values
    const controlMap = new Map(controlEntries)
    if (node.data) {
      for (const [key, value] of Object.entries(node.data)) {
        // Exclude metadata fields
        if (key !== 'label' && key !== 'nodeType' && key !== 'definition') {
          controlMap.set(key, value)
        }
      }
    }

    // Capability context (SECURITY_MODEL step 2) resolved from the AUTHORITATIVE registry
    // definition — never the node's embedded copy — so a community node can't spoof its
    // trust tier or fabricate protocol declarations via its saved flow.
    const registryDef = this.nodesStore.getDefinition(nodeType)
    const capabilityContext: ConnectionCapabilityContext = Object.freeze({
      nodeType,
      // Fail CLOSED: a running node whose registry definition is missing is treated as
      // `community` (most restrictive), never `core` — so the invariant "executor exists ⇒
      // trusted registry def" can't be inverted into a trust-escalation if it's ever broken.
      trust: registryDef ? nodeTrust(registryDef) : 'community',
      declaredProtocols: Object.freeze((registryDef?.connections ?? []).map((c) => c.protocol)),
    })

    const context = createExecutionContext(
      {
        nodeId: node.id,
        inputs: this.getNodeInputs(node.id),
        controls: controlMap,
        definition: definition!,
        deltaTime,
        totalTime: (performance.now() - this.startTime) / 1000,
        frameCount: this.frameCount,
      },
      capabilityContext
    )

    try {
      const isDeferred = this.deferredNodeTypes.has(nodeType)

      // Deferred (fire-and-latch) path for long-latency async node types: never
      // block the frame and never re-fire while an op is in flight (no request
      // storm), serving the last cached outputs until the result lands.
      if (isDeferred && this.inFlightAsync.has(node.id)) {
        return { nodeId: node.id, outputs: this.stableCachedOutputs(node.id), duration: 0 }
      }

      // Call the executor once.
      const result = executor(context)

      if (isDeferred && result instanceof Promise) {
        this.inFlightAsync.add(node.id)
        result
          .then((resolved) => this.applyDeferredResult(node.id, resolved))
          .catch((err) => this.handleDeferredError(node.id, err))
          .finally(() => this.inFlightAsync.delete(node.id))
        return {
          nodeId: node.id,
          outputs: this.stableCachedOutputs(node.id),
          duration: performance.now() - startTime,
        }
      }

      // Default path — awaits sync Maps and non-deferred async results (unchanged)
      const outputs = await result
      this.nodeOutputs.set(node.id, outputs)

      // Handle special executor outputs for dynamic port updates
      // These allow executors to signal node data changes (e.g., shader preset selection)
      this.handleSpecialOutputs(node.id, outputs)

      // Surface a soft error (an `error`/`_error` output) on the node badge.
      // Executors report recoverable/steady-state failures this way — e.g. a model
      // that isn't loaded yet — instead of throwing. The public `error` port wins,
      // but ONLY when it's a non-empty string; an empty/absent/non-string `error`
      // falls back to the legacy internal `_error` (so a node that emits `error:''`
      // every frame — e.g. the texture-render AI nodes — can't shadow a real
      // `_error` transient). Unlike a thrown error this does not push to errors[]
      // or bump errorCount; it only drives the badge and clears on the next clean frame.
      const publicError = outputs.get('error')
      const softErrorValue =
        typeof publicError === 'string' && publicError !== '' ? publicError : outputs.get('_error')
      const softError =
        typeof softErrorValue === 'string' && softErrorValue !== '' ? softErrorValue : null

      // Update runtime metrics
      this.runtimeStore.updateNodeMetrics(node.id, {
        lastExecutionTime: performance.now() - startTime,
        outputValues: Object.fromEntries(outputs),
        softError,
      })

      return {
        nodeId: node.id,
        outputs,
        duration: performance.now() - startTime,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      this.runtimeStore.addError({
        nodeId: node.id,
        message: err.message,
        timestamp: Date.now(),
      })

      return {
        nodeId: node.id,
        outputs: new Map(),
        error: err,
        duration: performance.now() - startTime,
      }
    }
  }

  /**
   * Handle special executor outputs that trigger node data updates
   * These are outputs prefixed with _ that signal the engine to update the node
   */
  private handleSpecialOutputs(nodeId: string, outputs: Map<string, unknown>): void {
    const flowsStore = useFlowsStore()
    const updates: Record<string, unknown> = {}
    let hasUpdates = false

    // Check for dynamic inputs update (shader nodes)
    if (outputs.has('_dynamicInputs')) {
      updates._dynamicInputs = outputs.get('_dynamicInputs')
      hasUpdates = true
    }

    // Check for dynamic controls update (shader nodes)
    if (outputs.has('_dynamicControls')) {
      updates._dynamicControls = outputs.get('_dynamicControls')
      hasUpdates = true
    }

    // Check for dynamic outputs update (dispatch node)
    if (outputs.has('_dynamicOutputs')) {
      updates._dynamicOutputs = outputs.get('_dynamicOutputs')
      hasUpdates = true
    }

    // Check for preset code update (shader nodes)
    if (outputs.has('_preset_code')) {
      updates.code = outputs.get('_preset_code')
      hasUpdates = true
    }

    // Check for control value updates (e.g., auto-populated fields)
    if (outputs.has('_controlUpdates')) {
      const controlUpdates = outputs.get('_controlUpdates') as Record<string, unknown>
      if (controlUpdates && typeof controlUpdates === 'object') {
        Object.assign(updates, controlUpdates)
        hasUpdates = true
      }
    }

    // Apply updates if any
    if (hasUpdates) {
      flowsStore.updateNodeData(nodeId, updates)
    }
  }

  /**
   * Execute one frame of the graph
   */
  async executeFrame(): Promise<void> {
    const now = performance.now()
    const rawDelta = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60
    const deltaTime = clampDelta(rawDelta)
    this.lastFrameTime = now
    this.frameCount++

    // Snapshot execution order and the node lookup to prevent race conditions
    // if updateGraph() is called during execution. updateGraph() replaces
    // nodeById wholesale (never mutates in place), so capturing the reference
    // is a consistent snapshot.
    const executionOrderSnapshot = [...this.executionOrder]
    const nodeByIdSnapshot = this.nodeById

    if (this.executionMode === 'dirty') {
      await this.executeFrameDirty(executionOrderSnapshot, nodeByIdSnapshot, deltaTime)
    } else {
      // Full mode: execute every node in topological order, every frame.
      let executed = 0
      for (const nodeId of executionOrderSnapshot) {
        const node = nodeByIdSnapshot.get(nodeId)
        if (node) {
          await this.executeNode(node, deltaTime)
          executed++
        }
      }
      this.lastFrameExecutedCount = executed
      // Full mode recomputes everything each frame, so async-change hints aren't
      // needed; clear them to keep the set bounded.
      this.pendingAsyncChange.clear()
    }

    // End-of-frame hooks (messaging change-flag reset, etc.) via the generic loop.
    for (const l of this.lifecycles) l.endFrame?.()

    // Update FPS
    this.runtimeStore.updateFps(deltaTime)
  }

  /**
   * Change-driven frame execution. A node runs this frame only if it is not a
   * verified-pure node (always run), or — for pure nodes — if it has never run,
   * its controls changed, or any upstream output changed this frame. Skipped
   * nodes keep their previous outputs, which (for pure nodes with unchanged
   * inputs) are exactly what full mode would recompute. Behavior is identical to
   * full mode; only redundant pure recomputation is avoided.
   */
  private async executeFrameDirty(
    order: string[],
    nodeById: Map<string, Node>,
    deltaTime: number,
  ): Promise<void> {
    const changed = new Set<string>() // nodes whose output changed this frame
    let executed = 0

    for (const nodeId of order) {
      const node = nodeById.get(nodeId)
      if (!node) continue

      const nodeType = node.data?.nodeType as string
      const pure = PURE_NODE_TYPES.has(nodeType)

      let curControls: Map<string, unknown> | null = null
      let mustRun = true
      if (pure) {
        curControls = this.getControlSnapshot(node)
        const neverRan = !this.nodeOutputs.has(nodeId)
        const prevControls = this.prevControlSnapshots.get(nodeId)
        const controlsChanged = !prevControls || !this.snapshotsEqual(prevControls, curControls)
        const inputsChanged = this.anyUpstreamChanged(nodeId, changed)
        mustRun = neverRan || controlsChanged || inputsChanged
      }

      if (mustRun) {
        const prevOutputs = this.nodeOutputs.get(nodeId)
        const result = await this.executeNode(node, deltaTime)
        executed++
        // A deferred async result that landed out-of-band counts as a change too
        // (delete doubles as has-and-clear).
        const asyncChanged = this.pendingAsyncChange.delete(nodeId)
        if (asyncChanged || this.outputsDiffer(prevOutputs, result.outputs)) changed.add(nodeId)
        if (pure && curControls) this.prevControlSnapshots.set(nodeId, curControls)
      }
      // Skipped: outputs are unchanged and intentionally not added to `changed`.
    }

    this.lastFrameExecutedCount = executed
  }

  /** Snapshot a node's controls (node.data minus engine metadata) for change detection. */
  private getControlSnapshot(node: Node): Map<string, unknown> {
    const snap = new Map<string, unknown>()
    const data = node.data as Record<string, unknown> | undefined
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'label' && key !== 'nodeType' && key !== 'definition') {
          snap.set(key, value)
        }
      }
    }
    return snap
  }

  /** Equal iff same keys and each value is identical (Object.is). Objects compare by ref. */
  private snapshotsEqual(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
    if (a.size !== b.size) return false
    for (const [key, value] of a) {
      if (!b.has(key) || !Object.is(value, b.get(key))) return false
    }
    return true
  }

  /** Conservative output comparison: any added/removed key or non-identical value ⇒ changed. */
  private outputsDiffer(
    prev: Map<string, unknown> | undefined,
    next: Map<string, unknown>,
  ): boolean {
    if (!prev || prev.size !== next.size) return true
    for (const [key, value] of next) {
      if (!prev.has(key) || !Object.is(prev.get(key), value)) return true
    }
    return false
  }

  /** True if any node feeding this one changed its output this frame. */
  private anyUpstreamChanged(nodeId: string, changed: Set<string>): boolean {
    const sources = this.sourcesByTarget.get(nodeId)
    if (!sources) return false
    for (const src of sources) {
      if (changed.has(src)) return true
    }
    return false
  }

  /**
   * Select the execution strategy. 'full' (default) re-executes every node each
   * frame. 'dirty' is change-driven (see executeFrameDirty). Switching modes
   * clears change-tracking state so the next frame cold-starts correctly.
   */
  setExecutionMode(mode: ExecutionMode): void {
    if (mode === this.executionMode) return
    this.executionMode = mode
    this.prevControlSnapshots.clear()
  }

  getExecutionMode(): ExecutionMode {
    return this.executionMode
  }

  /** Number of nodes executed in the most recent frame (0 for a fully-idle dirty graph). */
  getLastFrameExecutedCount(): number {
    return this.lastFrameExecutedCount
  }

  /**
   * Opt node types into fire-and-latch (non-blocking) execution. Use only for
   * long, occasionally-triggered async work (HTTP, heavy inference) — never for
   * per-frame async nodes (MediaPipe, webcam) that rely on awaited results.
   */
  setDeferredNodeTypes(types: Iterable<string>): void {
    this.deferredNodeTypes = new Set(types)
  }

  getDeferredNodeTypes(): ReadonlySet<string> {
    return this.deferredNodeTypes
  }

  /**
   * Last resolved outputs for a deferred node, persisting a STABLE empty map
   * until the first result so dirty mode sees an unchanged output while pending.
   */
  private stableCachedOutputs(id: string): Map<string, unknown> {
    let cached = this.nodeOutputs.get(id)
    if (!cached) {
      cached = new Map<string, unknown>()
      this.nodeOutputs.set(id, cached)
    }
    return cached
  }

  /** Apply a deferred async result that resolved out-of-band (between frames). */
  private applyDeferredResult(id: string, outputs: Map<string, unknown>): void {
    // The promise may resolve after stop() or after the node was removed — drop it.
    if (!this.acceptAsyncResults || !this.nodeById.has(id)) return
    this.nodeOutputs.set(id, outputs)
    this.handleSpecialOutputs(id, outputs)
    this.pendingAsyncChange.add(id) // signal dirty mode that this output changed
    this.runtimeStore.updateNodeMetrics(id, {
      lastExecutionTime: 0,
      outputValues: Object.fromEntries(outputs),
    })
  }

  private handleDeferredError(id: string, err: unknown): void {
    if (!this.acceptAsyncResults || !this.nodeById.has(id)) return
    const e = err instanceof Error ? err : new Error(String(err))
    this.runtimeStore.addError({ nodeId: id, message: e.message, timestamp: Date.now() })
  }

  /**
   * Start the execution loop
   */
  start(): void {
    if (this.runtimeStore.isRunning) return

    this.startTime = performance.now()
    this.resetFrameTiming()
    this.frameCount = 0
    // Clear stale outputs from previous execution
    this.nodeOutputs.clear()
    this.prevControlSnapshots.clear()
    this.inFlightAsync.clear()
    this.pendingAsyncChange.clear()
    this.acceptAsyncResults = true
    // ai + opencv un-flag their disposed-node markers here via their defineLifecycle
    // onStart hooks (stop→restart guard) — drained by the generic loop below.
    for (const l of this.lifecycles) l.onStart?.()
    this.runtimeStore.start()

    this.addVisibilityListener()
    this.scheduleLoop()
  }

  /**
   * Schedule the requestAnimationFrame loop. Shared by start(), resume(), and
   * visibility-driven resume so timing/FPS-cap behavior stays consistent.
   */
  private scheduleLoop(): void {
    // Claim a fresh token; any previously-running loop is now superseded.
    const token = ++this.loopToken

    const loop = async (timestamp?: number) => {
      if (!this.runtimeStore.isRunning || token !== this.loopToken) return

      const now = timestamp ?? performance.now()
      // FPS cap: only execute when enough time has elapsed (uncapped by default).
      if (shouldRenderFrame(now, this.lastRenderTime, this.targetFps)) {
        this.lastRenderTime = now
        await this.executeFrame()
      }

      // Re-arm only if this loop is still the active one (it may have been
      // stopped/paused/hidden during the await above).
      if (this.runtimeStore.isRunning && token === this.loopToken) {
        this.animationFrameId = requestAnimationFrame(loop)
      }
    }

    this.animationFrameId = requestAnimationFrame(loop)
  }

  /** Invalidate the active loop so a pending re-arm is suppressed. */
  private invalidateLoop(): void {
    this.loopToken++
  }

  /** Reset frame timing so the next frame reports a normal delta, not a spike. */
  private resetFrameTiming(): void {
    this.lastFrameTime = 0
    this.lastRenderTime = 0
  }

  /**
   * Pause/resume the loop when the document is hidden/visible. Backgrounded tabs
   * already throttle rAF; doing this explicitly also lets us reset timing on
   * return so time-based nodes don't jump, and stops burning the frame budget
   * when nothing is visible (battery/thermal — important on mobile).
   */
  private onVisibilityChange(): void {
    if (typeof document === 'undefined') return

    if (document.hidden) {
      if (this.runtimeStore.isRunning && !this.autoPausedByVisibility) {
        if (this.animationFrameId !== null) {
          cancelAnimationFrame(this.animationFrameId)
          this.animationFrameId = null
        }
        // Suppress re-arm if a frame is mid-await right now.
        this.invalidateLoop()
        this.autoPausedByVisibility = true
      }
    } else if (this.autoPausedByVisibility) {
      this.autoPausedByVisibility = false
      if (this.runtimeStore.isRunning) {
        this.resetFrameTiming()
        this.scheduleLoop()
      }
    }
  }

  private addVisibilityListener(): void {
    if (this.visibilityHandler || typeof document === 'undefined') return
    this.visibilityHandler = () => this.onVisibilityChange()
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private removeVisibilityListener(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    this.visibilityHandler = null
    this.autoPausedByVisibility = false
  }

  /**
   * Set the target frame rate. 0 (default) runs uncapped at the display refresh
   * rate. A positive value throttles execution — useful on battery/mobile.
   */
  setTargetFps(fps: number): void {
    this.targetFps = Number.isFinite(fps) && fps > 0 ? fps : 0
  }

  /** Current target fps (0 = uncapped). */
  getTargetFps(): number {
    return this.targetFps
  }

  /**
   * Stop the execution loop
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.invalidateLoop()
    this.removeVisibilityListener()
    this.runtimeStore.stop()
    this.nodeOutputs.clear()
    this.prevControlSnapshots.clear()
    // Stop accepting any in-flight async results that resolve after this point.
    this.acceptAsyncResults = false
    this.inFlightAsync.clear()
    this.pendingAsyncChange.clear()
    this.frameCount = 0

    // Clean up all executor state to prevent memory leaks and stop audio. subflow is
    // the last hand-wired category (deferred to Phase 7); everything else (audio,
    // visual, 3d, connectivity, clasp, ai, opencv, emulation, webllm, and every
    // defineNodeState store) is disposed by the generic lifecycle loop.
    clearAllSubflowContexts()
    for (const l of this.lifecycles) l.disposeAll()
  }

  /**
   * Pause the execution loop
   */
  pause(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    // User-initiated pause: drop visibility handling so a tab focus change
    // doesn't silently resume execution behind the user's back.
    this.invalidateLoop()
    this.removeVisibilityListener()
    this.runtimeStore.pause()
  }

  /**
   * Resume the execution loop
   */
  resume(): void {
    if (!this.runtimeStore.isPaused) return

    this.runtimeStore.resume()
    this.resetFrameTiming()
    this.addVisibilityListener()
    this.scheduleLoop()
  }

  /**
   * Get current output value for a node port
   */
  getOutputValue(nodeId: string, portId: string): unknown {
    return this.nodeOutputs.get(nodeId)?.get(portId)
  }

  /**
   * Get all outputs for a node
   */
  getNodeOutputs(nodeId: string): Map<string, unknown> | undefined {
    return this.nodeOutputs.get(nodeId)
  }

  /**
   * Get texture output for a node (direct access for display components)
   * This bypasses Vue reactivity issues with Object.fromEntries()
   */
  getNodeTexture(nodeId: string): unknown {
    const outputs = this.nodeOutputs.get(nodeId)
    if (!outputs) return null

    // Try common texture output names
    return outputs.get('texture') ?? outputs.get('_input_texture') ?? outputs.get('_display') ?? null
  }

  /**
   * Get all node outputs as Map (preserves texture references)
   * Use this instead of nodeMetrics.outputValues for texture access
   */
  getAllNodeOutputs(): Map<string, Map<string, unknown>> {
    return this.nodeOutputs
  }

  /**
   * Check if execution engine has outputs for a node
   */
  hasNodeOutputs(nodeId: string): boolean {
    return this.nodeOutputs.has(nodeId)
  }
}

// Singleton instance
let engineInstance: ExecutionEngine | null = null

export function getExecutionEngine(): ExecutionEngine {
  if (!engineInstance) {
    engineInstance = new ExecutionEngine()
  }
  return engineInstance
}
