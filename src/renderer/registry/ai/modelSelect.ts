import { deriveModelDefinition } from '@/engine/defineNode'
import { getModelSelectOptions } from '@/services/ai/AIInference'
import type { NodeDefinition } from '../types'

/**
 * Append the standardized model outputs (`loading`/`progress`/`done`/`error`) and a
 * catalog-populated `model` select to an AI node definition for the given task.
 *
 * The single place the AI registry wires the engine's catalog-agnostic
 * `deriveModelDefinition` to the model catalog: it injects the options resolver so
 * `defineNode.ts` never imports the AI service. The select defaults to `''`, which
 * every inference method resolves to the task default (`modelId || getDefaultModel`)
 * — so adopting it is additive and a saved flow with no `model` value behaves
 * exactly as before. `task` must match the string the node's executor passes to
 * `runModelInference`, so the select's default resolves to the model it actually runs.
 */
export function withModelSelect(definition: NodeDefinition, task: string): NodeDefinition {
  return deriveModelDefinition(definition, [{ task }], (t) => ({
    options: getModelSelectOptions(t),
    default: '',
  }))
}
