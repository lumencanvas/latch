import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'oscillator',
  name: 'Oscillator',
  version: '1.0.0',
  category: 'audio',
  description: 'Generate audio waveform',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'frequency', type: 'number', label: 'Freq' },
    { id: 'detune', type: 'number', label: 'Detune' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'frequency', type: 'number', label: 'Freq' },
  ],
  controls: [
    { id: 'frequency', type: 'number', label: 'Frequency', default: 440 },
    { id: 'detune', type: 'number', label: 'Detune', default: 0 },
    { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine', props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
    { id: 'volume', type: 'number', label: 'Volume (dB)', default: -6 },
  ],
  tags: ['oscillator', 'osc', 'tone', 'sine', 'square', 'saw', 'triangle', 'synth', 'generator'],
  info: {
    overview: 'Generates a continuous audio waveform at a specified frequency. Supports sine, square, triangle, and sawtooth shapes. This is a fundamental building block for synthesis, test tones, and modulation sources.',
    tips: [
      'Use sine for pure tones and sub-bass; use sawtooth for harmonically rich leads and basses.',
      'Connect the frequency input from a MIDI node or envelope to play melodic pitches.',
      'Detune two oscillators slightly against each other for a thick, chorused sound.',
    ],
    pairsWith: ['gain', 'filter', 'envelope', 'audio-output', 'audio-analyzer'],
  },
}

const MIN_OSCILLATOR_VOLUME = -96 // Essentially silent
const MAX_OSCILLATOR_VOLUME = 6 // Some headroom but prevents extreme amplification

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequency = (ctx.inputs.get('frequency') as number) ?? (ctx.controls.get('frequency') as number) ?? 440
  const detune = (ctx.inputs.get('detune') as number) ?? (ctx.controls.get('detune') as number) ?? 0
  const waveform = (ctx.controls.get('waveform') as OscillatorType) ?? 'sine'
  const rawVolume = (ctx.controls.get('volume') as number) ?? -6 // dB
  // Clamp volume to safe bounds
  const volume = Math.max(MIN_OSCILLATOR_VOLUME, Math.min(MAX_OSCILLATOR_VOLUME, rawVolume))

  // Get or create oscillator
  const osc = getOrCreateNode(ctx.nodeId, () => {
    const oscillator = new Tone.Oscillator({
      frequency,
      type: waveform,
      volume,
    })
    oscillator.start()
    return oscillator
  })

  // Update parameters
  osc.frequency.value = frequency
  osc.detune.value = detune
  if (osc.type !== waveform) {
    osc.type = waveform
  }
  osc.volume.value = volume

  const outputs = new Map<string, unknown>()
  outputs.set('audio', osc)
  outputs.set('frequency', frequency)
  return outputs
}

export default defineNode({ definition, executor })
