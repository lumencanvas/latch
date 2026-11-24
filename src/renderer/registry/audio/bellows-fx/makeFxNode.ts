import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition, NodeInfo } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { buildFxControls, fxModInputs, resolveFxConfig } from './fxParams'
import { runFx } from './fxManager'

export interface FxNodeSpec {
  id: string
  name: string
  description: string
  icon: string
  /** bellows effect ids this node offers (the first is the default). */
  effects: readonly string[]
  /** Params of the DEFAULT effect exposed as wireable inputs (same id as their control). */
  modInputs?: readonly string[]
  info: NodeInfo
  tags?: string[]
}

/**
 * A bellows effect node: Audio in → one bellows insert effect → Audio out, a normal LATCH audio
 * source (silent until Audio out is wired, like every bellows node).
 */
export function makeFxNode(spec: FxNodeSpec) {
  const definition: NodeDefinition = {
    id: spec.id,
    name: spec.name,
    version: '1.0.0',
    category: 'audio',
    description: spec.description,
    icon: spec.icon,
    platforms: ['web', 'electron'],
    inputs: [
      { id: 'audio', type: 'audio', label: 'Audio' },
      ...fxModInputs(spec.effects[0], spec.modInputs ?? []),
    ],
    outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
    controls: [
      ...buildFxControls(spec.effects),
      { id: 'level', type: 'number', label: 'Output Level', default: 1, props: { min: 0, max: 2, step: 0.01 } },
    ],
    info: spec.info,
    tags: ['bellows', 'effect', 'fx', 'audio', ...(spec.tags ?? [])],
  }

  const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
    const read = (id: string) => ctx.inputs.get(id) ?? ctx.controls.get(id)
    const cfg = resolveFxConfig(spec.effects, read)
    const audio = runFx(ctx.nodeId, cfg, ctx.inputs.get('audio') ?? null, !!ctx.connectedOutputs?.has('audio'))
    return new Map<string, unknown>([['audio', audio]])
  }

  return defineNode({ definition, executor })
}
