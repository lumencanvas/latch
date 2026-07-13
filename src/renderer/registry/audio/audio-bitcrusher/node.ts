import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { getOrCreateNode, connectEffectInput } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-bitcrusher',
  name: 'Bitcrusher',
  version: '1.0.0',
  category: 'audio',
  description: 'Bit-depth reduction for lo-fi, crunchy digital distortion.',
  icon: 'grid-2x2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'bits', type: 'number', label: 'Bits' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'bits', type: 'slider', label: 'Bits', default: 4, props: { min: 1, max: 16, step: 1 } },
    { id: 'wet', type: 'slider', label: 'Mix', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['bitcrusher', 'lo-fi', 'crush', 'digital', 'distortion', 'audio', 'effect', '8-bit'],
  info: {
    overview:
      'Quantizes the signal to a reduced bit depth for a crunchy, lo-fi digital sound. Fewer Bits = harsher crush; Mix blends against the clean input.',
    tips: [
      'Bits around 4–6 give a classic 8-bit / chiptune character.',
      'Pair with a low-pass Filter to tame the harsh high frequencies it adds.',
    ],
    pairsWith: ['oscillator', 'audio-distortion', 'filter', 'audio-output'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const bits = (ctx.inputs.get('bits') as number) ?? (ctx.controls.get('bits') as number) ?? 4
  const wet = (ctx.controls.get('wet') as number) ?? 1

  const outputs = new Map<string, unknown>()
  if (!audio) {
    outputs.set('audio', null)
    return outputs
  }

  const crusher = getOrCreateNode(
    ctx.nodeId,
    () => new Tone.BitCrusher({ bits })
  ) as Tone.BitCrusher
  crusher.bits.value = bits
  crusher.wet.value = wet
  connectEffectInput(ctx.nodeId, audio, crusher)

  outputs.set('audio', crusher)
  return outputs
}

export default defineNode({ definition, executor })
