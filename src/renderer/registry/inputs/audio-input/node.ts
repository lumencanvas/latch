import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioManager } from '@/services/audio/AudioManager'
import { getOrCreateNode } from '../../audio/shared'

const definition: NodeDefinition = {
  id: 'audio-input',
  name: 'Audio Input',
  version: '1.0.0',
  category: 'inputs',
  description: 'Capture audio from microphone',
  icon: 'mic',
  platforms: ['web', 'electron'],
  // Self-captures the mic via getUserMedia (same capability as webcam), so it
  // warns when media capture is unavailable instead of failing silently.
  requires: ['camera'],
  inputs: [],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'level', type: 'number', label: 'Level' },
    { id: 'beat', type: 'trigger', label: 'Beat' },
  ],
  controls: [
    {
      id: 'source',
      type: 'select',
      label: 'Source',
      default: 'default',
      props: { deviceType: 'audio-input' },
    },
  ],
  tags: ['audio input', 'microphone', 'mic', 'line in', 'capture', 'source'],
  info: {
    overview: 'Captures live audio from a microphone or other system input device. It provides a raw audio stream, a level envelope, and a beat trigger. The source selector lets you pick which input device to use when multiple are available.',
    tips: [
      'Connect the beat output to a counter or toggle for rhythm-reactive patches.',
      'Use the level output with a map-range node to scale microphone loudness to a useful parameter range.',
      'Grant microphone permissions before adding this node to avoid silent failures.',
    ],
    pairsWith: ['audio-analyzer', 'beat-detect', 'gain', 'filter'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    outputs.set('level', -Infinity)
    return outputs
  }

  // Ensure microphone is available
  if (!audioManager.hasMicrophone) {
    try {
      await audioManager.requestMicrophoneAccess()
    } catch {
      const outputs = new Map<string, unknown>()
      outputs.set('audio', null)
      outputs.set('level', -Infinity)
      outputs.set('_error', 'Microphone access denied')
      return outputs
    }
  }

  const mic = audioManager.microphoneSource
  if (!mic) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    outputs.set('level', -Infinity)
    return outputs
  }

  // Get or create meter for this node
  const meter = getOrCreateNode(`${ctx.nodeId}_meter`, () => {
    const m = new Tone.Meter()
    mic.connect(m)
    return m
  })

  const level = meter.getValue()
  const normalizedLevel = typeof level === 'number' ? level : level[0]

  const outputs = new Map<string, unknown>()
  outputs.set('audio', mic)
  outputs.set('level', normalizedLevel)
  return outputs
}

export default defineNode({ definition, executor })
