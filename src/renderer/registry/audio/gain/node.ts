import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'gain',
  name: 'Gain',
  version: '1.0.0',
  category: 'audio',
  description: 'Adjust audio volume',
  icon: 'volume-1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'gain', type: 'number', label: 'Gain' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'gain', type: 'number', label: 'Gain', default: 1 },
  ],
  tags: ['gain', 'volume', 'level', 'amplitude', 'amp', 'loudness'],
  info: {
    overview: 'Multiplies the audio signal amplitude by a gain factor. A value of 1 passes audio unchanged, values below 1 attenuate, and values above 1 amplify. This is the primary volume control node in any audio chain.',
    tips: [
      'Connect an envelope output to the gain input for amplitude modulation.',
      'Place a gain node right before audio output as a master volume control.',
      'Use a gain of 0 as a quick mute, or connect an LFO for tremolo effects.',
    ],
    pairsWith: ['audio-output', 'oscillator', 'filter', 'envelope', 'audio-player'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const gain = (ctx.inputs.get('gain') as number) ?? (ctx.controls.get('gain') as number) ?? 1

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create gain node
  const gainNode = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.Gain(gain)
  }) as Tone.Gain

  // Update gain
  gainNode.gain.value = gain

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(gainNode)
    }
    audio.connect(gainNode)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', gainNode)
  return outputs
}

export default defineNode({ definition, executor })
