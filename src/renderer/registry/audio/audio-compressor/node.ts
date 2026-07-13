import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { getOrCreateNode, connectEffectInput } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-compressor',
  name: 'Compressor',
  version: '1.0.0',
  category: 'audio',
  description: 'Dynamic-range compressor / limiter — tames peaks and evens out levels.',
  icon: 'minimize-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'threshold', type: 'number', label: 'Threshold' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'reduction', type: 'number', label: 'Reduction (dB)' },
  ],
  controls: [
    { id: 'threshold', type: 'slider', label: 'Threshold (dB)', default: -24, props: { min: -60, max: 0, step: 1 } },
    { id: 'ratio', type: 'slider', label: 'Ratio', default: 4, props: { min: 1, max: 20, step: 0.5 } },
    { id: 'attack', type: 'slider', label: 'Attack (s)', default: 0.003, props: { min: 0, max: 1, step: 0.001 } },
    { id: 'release', type: 'slider', label: 'Release (s)', default: 0.25, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'knee', type: 'slider', label: 'Knee (dB)', default: 30, props: { min: 0, max: 40, step: 1 } },
  ],
  tags: ['compressor', 'limiter', 'dynamics', 'audio', 'effect', 'mastering'],
  info: {
    overview:
      'Reduces the dynamic range of the signal: anything above the threshold is attenuated by the ratio. Use a high ratio (12–20) as a limiter to catch peaks, or a gentle ratio (2–4) to glue a mix together. The Reduction output reports current gain reduction in dB for metering.',
    tips: [
      'Set Threshold so only the loudest moments cross it, then dial Ratio for the amount of squash.',
      'Short Attack catches transients; longer Release sounds more natural.',
    ],
    pairsWith: ['audio-output', 'gain', 'audio-analyzer', 'beat-detect'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const threshold = (ctx.inputs.get('threshold') as number) ?? (ctx.controls.get('threshold') as number) ?? -24
  const ratio = (ctx.controls.get('ratio') as number) ?? 4
  const attack = (ctx.controls.get('attack') as number) ?? 0.003
  const release = (ctx.controls.get('release') as number) ?? 0.25
  const knee = (ctx.controls.get('knee') as number) ?? 30

  const outputs = new Map<string, unknown>()
  if (!audio) {
    outputs.set('audio', null)
    outputs.set('reduction', 0)
    return outputs
  }

  const comp = getOrCreateNode(
    ctx.nodeId,
    () => new Tone.Compressor({ threshold, ratio, attack, release, knee })
  ) as Tone.Compressor
  comp.threshold.value = threshold
  comp.ratio.value = ratio
  comp.attack.value = attack
  comp.release.value = release
  comp.knee.value = knee
  connectEffectInput(ctx.nodeId, audio, comp)

  outputs.set('audio', comp)
  outputs.set('reduction', comp.reduction)
  return outputs
}

export default defineNode({ definition, executor })
