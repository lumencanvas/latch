/**
 * `defineNode` — the unified node manifest.
 *
 * One declarative unit that pairs a node's `definition` (ports/controls/metadata)
 * with its `executor` (runtime behavior) and the orthogonal capability/lifecycle
 * metadata the engine and UI derive everything else from. Built-in and custom
 * nodes converge on this one contract (a custom node already builds
 * `{definition, executor}` at runtime — that's a `NodeSpec` too).
 *
 * **Frozen public contract** (POLICIES §2): fields are additive-only within a
 * major version — never repurposed or removed; retirement goes through a
 * deprecation cycle with a node-data `migrate()`. Some fields named in
 * EXTENSIBILITY_ARCHITECTURE §3 (`ui`, `models`, `lifecycle`) arrive with their
 * owning phases (§9/§8/§4); being optional, adding them later is non-breaking.
 *
 * Additive: nothing is auto-discovered through this yet — the `nodeRegistry` glob
 * and per-node co-location come later (ROADMAP Phase 0 §2c / Phase 6).
 */

import type { Component } from 'vue'
import type { NodeDefinition } from '@/stores/nodes'
import type { NodeExecutorFn } from './ExecutionEngine'
import type { NodeRequirement } from '@/utils/platform'
import type { NodeConnectionRequirement } from '@/services/connections/types'
import type { ModelRequirement } from '@/services/ai/defineModel'

export interface NodeSpec {
  /** Ports / controls / metadata. */
  readonly definition: NodeDefinition
  /** Runtime behavior. */
  readonly executor: NodeExecutorFn
  /** Node-data schema version (drives migration). Defaults to 1 when absent. */
  readonly version?: number
  /** Upgrade saved control data created at `from` to the current schema. */
  readonly migrate?: (data: Record<string, unknown>, from: number) => Record<string, unknown>
  /** Pure (no side effects / state) → safe to skip in dirty mode. Replaces `PURE_NODE_TYPES`. */
  readonly pure?: boolean
  /** Fire-and-latch async (don't block the frame). Replaces `setDeferredNodeTypes`. */
  readonly deferred?: boolean
  /** Bespoke SFC escape hatch; otherwise the node renders with BaseNode. */
  readonly component?: Component
  /** Abstract hardware/runtime capabilities this node needs (serial/webgpu/mic…). */
  readonly requires?: NodeRequirement[]
  /** Connection protocols this node needs. */
  readonly connections?: NodeConnectionRequirement[]
  /** AI model/task needs (a `model` select + standardized load/error outputs derive from these; §8). */
  readonly models?: ModelRequirement[]
}

/**
 * Identity function that brands a `NodeSpec`. Exists for inference + a single,
 * stable authoring surface (so every node folder exports the same shape).
 */
export function defineNode(spec: NodeSpec): NodeSpec {
  return spec
}
