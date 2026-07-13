import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioManager } from '@/services/audio/AudioManager'
import { audioNodes, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-output',
  name: 'Audio Output',
  version: '1.0.0',
  category: 'audio',
  description: 'Output audio to speakers',
  icon: 'volume-2',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  outputs: [],
  controls: [
    { id: 'volume', type: 'number', label: 'Volume (dB)', default: 0 },
    { id: 'mute', type: 'toggle', label: 'Mute', default: false },
  ],
  info: {
    overview: 'Routes audio to the system speakers or headphones. This is the final destination node in any audio chain. Volume is set in decibels and a mute toggle silences output without disconnecting the graph.',
    tips: [
      'Start with the volume at -12 dB or lower to avoid unexpected loud output.',
      'Use the mute toggle for quick A/B testing without tearing down connections.',
      'Only one audio output node is needed per patch; connect a gain node before it for master volume control.',
    ],
    pairsWith: ['gain', 'reverb', 'filter', 'audio-player'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const volume = (ctx.controls.get('volume') as number) ?? 0 // dB
  const mute = (ctx.controls.get('mute') as boolean) ?? false

  // Get or create gain for this output
  const gain = getOrCreateNode(`${ctx.nodeId}_gain`, () => {
    const g = new Tone.Gain(1)
    g.connect(audioManager.getMasterOutput())
    return g
  })

  // Update volume
  gain.gain.value = mute ? 0 : Tone.dbToGain(volume)

  // Connect input to gain if available
  if (audio && 'connect' in audio) {
    // Check if already connected
    const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
    if (prevInput !== audio) {
      if (prevInput) {
        prevInput.disconnect(gain)
      }
      audio.connect(gain)
      audioNodes.set(`${ctx.nodeId}_input`, audio)
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('_connected', audio !== null)
  return outputs
}

export default defineNode({ definition, executor })
