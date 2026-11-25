import { reactive } from 'vue'
import { defineLifecycle } from '@/engine/nodeState'

/**
 * Which nodes are waiting on an AI model that is not loaded. AI executors report here from their
 * "model not loaded" path (see runModelInference), so the editor can offer to load exactly the
 * models a running flow needs instead of leaving a red "Model not loaded" badge to be found.
 */
export interface ModelNeed {
  nodeId: string
  task: string
  /** '' = the task's default model. */
  modelId: string
}

export const modelNeeds = reactive(new Map<string, ModelNeed>())

export function reportModelNeed(nodeId: string, task: string, modelId: string | undefined): void {
  const m = modelId ?? ''
  const have = modelNeeds.get(nodeId)
  if (have && have.task === task && have.modelId === m) return
  modelNeeds.set(nodeId, { nodeId, task, modelId: m })
}

export function clearModelNeed(nodeId: string): void {
  if (modelNeeds.has(nodeId)) modelNeeds.delete(nodeId)
}

/** Distinct models across the needs, with the nodes waiting on each. */
export function groupModelNeeds(needs: Iterable<ModelNeed>): { task: string; modelId: string; nodeIds: string[] }[] {
  const byKey = new Map<string, { task: string; modelId: string; nodeIds: string[] }>()
  for (const n of needs) {
    const key = `${n.task}:${n.modelId}`
    const g = byKey.get(key) ?? { task: n.task, modelId: n.modelId, nodeIds: [] }
    g.nodeIds.push(n.nodeId)
    byKey.set(key, g)
  }
  return [...byKey.values()]
}

defineLifecycle({
  label: 'model-needs',
  gc: (valid) => { for (const id of [...modelNeeds.keys()]) if (!valid.has(id)) modelNeeds.delete(id) },
  disposeAll: () => modelNeeds.clear(),
})
