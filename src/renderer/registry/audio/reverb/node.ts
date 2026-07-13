import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'reverb',
  name: 'Reverb',
  version: '1.0.0',
  category: 'audio',
  description: 'Add reverb effect',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    { id: 'decay', type: 'slider', label: 'Decay', default: 1.5, props: { min: 0.1, max: 10, step: 0.1 } },
    { id: 'wet', type: 'slider', label: 'Wet', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'preDelay', type: 'slider', label: 'Pre-Delay', default: 0.01, props: { min: 0, max: 0.1, step: 0.001 } },
  ],
  tags: ['reverb', 'room', 'space', 'ambience', 'hall', 'echo', 'effect'],
  info: {
    overview: 'Simulates the reflections of a physical space by applying a reverb tail to the audio signal. The decay control sets how long the reverb rings out, and the wet control blends between dry and reverberant audio.',
    tips: [
      'Keep wet below 0.3 for subtle room ambience, or push above 0.7 for atmospheric wash effects.',
      'Increase pre-delay slightly to preserve transient clarity before the reverb tail begins.',
      'Place reverb after delay in the signal chain for a cleaner echo-into-space effect.',
    ],
    pairsWith: ['audio-delay', 'gain', 'audio-output', 'filter'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const decay = (ctx.controls.get('decay') as number) ?? 1.5
  const wet = (ctx.controls.get('wet') as number) ?? 0.5
  const preDelay = (ctx.controls.get('preDelay') as number) ?? 0.01

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create reverb
  const reverb = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.Reverb({
      decay,
      wet,
      preDelay,
    })
  }) as Tone.Reverb

  // Update parameters
  reverb.decay = decay
  reverb.wet.value = wet
  reverb.preDelay = preDelay

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(reverb)
    }
    audio.connect(reverb)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', reverb)
  return outputs
}

export default defineNode({ definition, executor })
