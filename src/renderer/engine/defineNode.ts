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
import type { NodeDefinition, PortDefinition, ControlDefinition } from '@/stores/nodes'
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
 * The standardized outputs every model-backed node gets, in this fixed canonical
 * order. Appended by the `models` derivation, but only for ids the author hasn't
 * already declared — so a node hand-rolling `loading`/`done` (the historical AI
 * shape) is not duplicated. Order is stable so the derived port array is
 * deterministic across rebuilds and saved-flow edges re-attach by id.
 *
 * `error` is a public, wireable port (the read-side latch in ExecutionEngine
 * surfaces it on the node badge); `_error` stays the internal-only channel for
 * non-model nodes.
 */
const MODEL_OUTPUT_PORTS: readonly PortDefinition[] = [
  { id: 'loading', type: 'boolean', label: 'Loading' },
  { id: 'progress', type: 'number', label: 'Progress' },
  { id: 'done', type: 'trigger', label: 'Done' },
  { id: 'error', type: 'string', label: 'Error' },
]

/**
 * Resolves a task's `model` select options + default value. Injected by the caller
 * that owns catalog knowledge (the AI registry, backed by `AI_MODELS` today, the
 * model registry after the derive) so this engine module stays catalog-agnostic —
 * `defineNode`/`deriveModelDefinition` never import the AI service.
 */
export type ModelSelectResolver = (task: string) => {
  options: readonly { value: string; label: string }[]
  default: string
}

/**
 * Derive the standardized model UI from a node's `models` declaration: append the
 * loading/progress/done/error outputs and (when some task is `selectable`) a
 * `model` select. Pure and idempotent — re-running it on its own output is a
 * no-op, since every append is guarded on the id already being present. When a
 * `resolveModelSelect` is supplied, the select's options + default are populated
 * from it (the first selectable task); without one the control carries an empty
 * placeholder (the inert `defineNode` path until per-node co-location).
 */
export function deriveModelDefinition(
  def: NodeDefinition,
  models: readonly ModelRequirement[],
  resolveModelSelect?: ModelSelectResolver,
): NodeDefinition {
  const existingOutputs = new Set(def.outputs.map((p) => p.id))
  const outputs: PortDefinition[] = [
    ...def.outputs,
    ...MODEL_OUTPUT_PORTS.filter((p) => !existingOutputs.has(p.id)),
  ]

  const wantsSelect = models.some((m) => m.selectable !== false)
  const hasModelControl = def.controls.some((c) => c.id === 'model')
  let controls = def.controls
  if (wantsSelect && !hasModelControl) {
    const task = models.find((m) => m.selectable !== false)?.task
    const resolved = task && resolveModelSelect ? resolveModelSelect(task) : undefined
    const modelControl: ControlDefinition = {
      id: 'model',
      type: 'select',
      label: 'Model',
      // '' resolves to the task default at inference time; a non-empty pick overrides.
      default: resolved?.default ?? '',
      props: { options: resolved ? [...resolved.options] : [] },
    }
    controls = [...def.controls, modelControl]
  }

  return { ...def, outputs, controls }
}

/**
 * Brand a `NodeSpec` and apply the `models` derivation. A strict no-op (returns
 * the spec object unchanged) unless `models` is non-empty, so the entire non-AI
 * node library is byte-identical to before. Every authored node flows through
 * here, which is why the derivation lives at this single authoring surface.
 */
export function defineNode(spec: NodeSpec): NodeSpec {
  if (!spec.models?.length) return spec
  return { ...spec, definition: deriveModelDefinition(spec.definition, spec.models) }
}
