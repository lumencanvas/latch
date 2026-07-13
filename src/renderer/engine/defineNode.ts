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
 * Live: all 241 built-in nodes are co-located as `registry/<cat>/<id>/node.ts` and
 * auto-discovered by the `nodeRegistry` glob (ROADMAP Phase 6 complete).
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
 * The globally-injected model-select resolver. `defineNode`/`defineNodes` apply it
 * to every `models:`-bearing spec, so a plain `defineNode({ models: [{ task }] })`
 * from ANY node (built-in or hand-authored) gets a populated `model` select — no
 * per-node shim. It's injected by the AI layer (`services/ai/AIInference.ts` calls
 * `setModelSelectResolver` at module scope, backed by `getModelSelectOptions`),
 * which keeps THIS engine module catalog-agnostic: it never imports the AI service,
 * the dependency arrow points AI→engine. `undefined` until wired, so a `defineNode()`
 * that runs before the resolver is injected simply DEFERS its select (see
 * `deriveModelDefinition`); `nodeRegistry` then re-derives every `models:` spec after
 * its glob — where the resolver is guaranteed set — so the select ends up populated
 * regardless of evaluation order.
 */
let modelSelectResolver: ModelSelectResolver | undefined

/** Inject (or clear, with `undefined`) the global model-select resolver. */
export function setModelSelectResolver(resolver: ModelSelectResolver | undefined): void {
  modelSelectResolver = resolver
}

/**
 * Derive the standardized model UI from a node's `models` declaration: append the
 * loading/progress/done/error outputs and (when some task is `selectable`) a
 * `model` select. Pure and idempotent — re-running it on its own output is a
 * no-op, since every append is guarded on the id already being present. The select
 * is added ONLY when a `resolveModelSelect` populates it (the first selectable
 * task); without a resolver the select is DEFERRED — not added at all — so the
 * registry can re-derive it with the injected global resolver at assembly
 * (`nodeRegistry`). This is what lets a node whose `defineNode()` ran before the
 * resolver was wired still end up with a populated select instead of an inert empty
 * one. The outputs, being resolver-independent, are always appended.
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
    // Defer the select entirely when it can't be populated yet — the registry re-derives once the
    // global resolver is wired, so we never bake an inert empty select that a later pass would skip.
    if (resolved) {
      const modelControl: ControlDefinition = {
        id: 'model',
        type: 'select',
        label: 'Model',
        // '' resolves to the task default at inference time; a non-empty pick overrides.
        default: resolved.default,
        props: { options: [...resolved.options] },
      }
      controls = [...def.controls, modelControl]
    }
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
  return { ...spec, definition: deriveModelDefinition(spec.definition, spec.models, modelSelectResolver) }
}

/**
 * Brand a whole FAMILY of nodes authored in one unit — a `registry/<cat>/<name>/nodes.ts`
 * (plural) file that `export default defineNodes([...])`, or a factory that generates a
 * parametric set (`['is-null','is-empty',…].map(makeCheck)`). Each spec flows through
 * `defineNode` (so the `models` derivation etc. applies per node), and the returned array
 * becomes the file's default export; the `nodeRegistry` collector flattens `NodeSpec[]`
 * defaults, applying the same dup-id / count / pure-set guards per spec. Lets one file
 * register many nodes instead of N near-identical folders (the Node-RED "one package,
 * many node types" idea, co-located).
 */
export function defineNodes(specs: readonly NodeSpec[]): NodeSpec[] {
  return specs.map(defineNode)
}
