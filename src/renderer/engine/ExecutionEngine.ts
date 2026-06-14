import type { Node, Edge } from '@vue-flow/core'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import type { NodeDefinition } from '@/stores/nodes'
import { disposeAllAudioNodes, gcAudioState } from './executors/audio'
import { disposeAllVisualNodes, gcVisualState } from './executors/visual'
import {
  disposeAllTimingState,
  disposeAllDebugState,
  disposeAllInputState,
} from './executors/index'
import { disposeAllUtilityState } from './executors/utility'
import {
  disposeAllMessagingState,
  endMessagingFrame,
} from './executors/messaging'
import { gcCodeState, disposeAllCodeNodes } from './executors/code'
import { gc3DState, disposeAll3DNodes } from './executors/3d'
import { disposeAllConnectivityNodes, gcConnectivityState } from './executors/connectivity'
import { disposeAllClaspConnections } from './executors/clasp'
import { disposeAllAINodes, gcAIState } from './executors/ai'

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
  'map-range', 'clamp', 'abs', 'trig', 'power', 'vector-math', 'modulo',
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
}

/**
 * Node executor function type
 */
export type NodeExecutorFn = (ctx: ExecutionContext) => Promise<Map<string, unknown>> | Map<string, unknown>

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
  private nodeOutputs: Map<string, Map<string, unknown>> = new Map()
  private executors: Map<string, NodeExecutorFn> = new Map()
  private animationFrameId: number | null = null
  private startTime: number = 0
  private lastFrameTime: number = 0
  private frameCount: number = 0
  private runtimeStore = useRuntimeStore()

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
        // Run garbage collection for orphaned state
        gcAudioState(validNodeIds)
        gcVisualState(validNodeIds)
        gcCodeState(validNodeIds)
        gc3DState(validNodeIds)
        gcConnectivityState(validNodeIds)
        gcAIState(validNodeIds)
        // Clean up node metrics for deleted nodes
        this.runtimeStore.gcNodeMetrics(validNodeIds)
        // Drop dirty-mode control snapshots for removed nodes
        for (const id of this.prevControlSnapshots.keys()) {
          if (!validNodeIds.has(id)) this.prevControlSnapshots.delete(id)
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

    // Find all edges that target this node
    for (const edge of this.edges) {
      if (edge.target === nodeId && edge.targetHandle && edge.sourceHandle) {
        const sourceOutputs = this.nodeOutputs.get(edge.source)
        if (sourceOutputs) {
          const value = sourceOutputs.get(edge.sourceHandle)
          if (value !== undefined) {
            inputs.set(edge.targetHandle, value)
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
    const definition = node.data?.definition as NodeDefinition | undefined

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

    const context: ExecutionContext = {
      nodeId: node.id,
      inputs: this.getNodeInputs(node.id),
      controls: controlMap,
      definition: definition!,
      deltaTime,
      totalTime: (performance.now() - this.startTime) / 1000,
      frameCount: this.frameCount,
    }

    try {
      // Execute
      const outputs = await executor(context)
      this.nodeOutputs.set(node.id, outputs)

      // Handle special executor outputs for dynamic port updates
      // These allow executors to signal node data changes (e.g., shader preset selection)
      this.handleSpecialOutputs(node.id, outputs)

      // Update runtime metrics
      this.runtimeStore.updateNodeMetrics(node.id, {
        lastExecutionTime: performance.now() - startTime,
        outputValues: Object.fromEntries(outputs),
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
    }

    // End-of-frame cleanup for messaging (reset change flags)
    endMessagingFrame()

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
        if (this.outputsDiffer(prevOutputs, result.outputs)) changed.add(nodeId)
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
    this.frameCount = 0

    // Clean up all executor state to prevent memory leaks and stop audio
    disposeAllAudioNodes()
    disposeAllVisualNodes()
    disposeAllTimingState()
    disposeAllDebugState()
    disposeAllInputState()
    disposeAllMessagingState()
    disposeAllCodeNodes()
    disposeAll3DNodes()
    disposeAllConnectivityNodes()
    disposeAllClaspConnections()
    disposeAllAINodes()
    disposeAllUtilityState()
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
