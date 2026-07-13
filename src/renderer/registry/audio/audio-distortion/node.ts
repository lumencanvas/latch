import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { getOrCreateNode, connectEffectInput } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-distortion',
  name: 'Distortion',
  version: '1.0.0',
  category: 'audio',
  description: 'Waveshaping distortion / overdrive.',
  icon: 'flame',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'amount', type: 'number', label: 'Amount' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'amount', type: 'slider', label: 'Amount', default: 0.4, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'wet', type: 'slider', label: 'Mix', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['distortion', 'overdrive', 'fuzz', 'waveshaper', 'audio', 'effect'],
  info: {
    overview:
      'Adds harmonic distortion by waveshaping the signal. Amount controls how hard it is driven; Mix blends the distorted signal against the clean input.',
    tips: [
      'Drive Amount from an envelope or LFO for evolving grit.',
      'Lower the Mix for parallel distortion that keeps the original punch.',
    ],
    pairsWith: ['oscillator', 'filter', 'audio-output', 'audio-bitcrusher'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const amount = (ctx.inputs.get('amount') as number) ?? (ctx.controls.get('amount') as number) ?? 0.4
  const wet = (ctx.controls.get('wet') as number) ?? 1

  const outputs = new Map<string, unknown>()
  if (!audio) {
    outputs.set('audio', null)
    return outputs
  }

  const dist = getOrCreateNode(
    ctx.nodeId,
    () => new Tone.Distortion({ distortion: amount, wet })
  ) as Tone.Distortion
  dist.distortion = amount
  dist.wet.value = wet
  connectEffectInput(ctx.nodeId, audio, dist)

  outputs.set('audio', dist)
  return outputs
}

export default defineNode({ definition, executor })
