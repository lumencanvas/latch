import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-delay',
  name: 'Delay',
  version: '1.0.0',
  category: 'audio',
  description: 'Add delay/echo effect',
  icon: 'repeat',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'time', type: 'number', label: 'Time' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'time', type: 'number', label: 'Delay (s)', default: 0.25 },
    { id: 'feedback', type: 'number', label: 'Feedback', default: 0.5 },
    { id: 'wet', type: 'number', label: 'Wet', default: 0.5 },
  ],
  tags: ['delay', 'echo', 'feedback', 'repeat', 'effect'],
  info: {
    overview: 'Adds a delay or echo effect to the audio signal. The feedback control determines how many times the delayed signal repeats, and the wet control blends between dry and delayed audio.',
    tips: [
      'Set feedback below 0.5 for a clean slapback echo, or above 0.7 for long, building repeats.',
      'Automate the delay time input for tape-style pitch warble effects.',
      'Use a short delay (under 30ms) with no feedback to create a simple doubling or comb filter effect.',
    ],
    pairsWith: ['reverb', 'gain', 'filter', 'audio-output'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const delayTime = (ctx.inputs.get('time') as number) ?? (ctx.controls.get('time') as number) ?? 0.25
  const feedback = (ctx.controls.get('feedback') as number) ?? 0.5
  const wet = (ctx.controls.get('wet') as number) ?? 0.5

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create delay
  const delay = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.FeedbackDelay({
      delayTime,
      feedback,
      wet,
    })
  }) as Tone.FeedbackDelay

  // Update parameters
  delay.delayTime.value = delayTime
  delay.feedback.value = feedback
  delay.wet.value = wet

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(delay)
    }
    audio.connect(delay)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', delay)
  return outputs
}

export default defineNode({ definition, executor })
