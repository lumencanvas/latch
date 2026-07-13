import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-analyzer',
  name: 'Audio Analyzer',
  version: '1.0.0',
  category: 'audio',
  description: 'Analyze audio levels and frequencies',
  icon: 'bar-chart-2',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  outputs: [
    { id: 'level', type: 'number', label: 'Level' },
    { id: 'bass', type: 'number', label: 'Bass' },
    { id: 'mid', type: 'number', label: 'Mid' },
    { id: 'high', type: 'number', label: 'High' },
  ],
  controls: [
    { id: 'smoothing', type: 'number', label: 'Smoothing', default: 0.8 },
  ],
  info: {
    overview: 'Splits an incoming audio signal into level, bass, mid, and high frequency bands as numeric outputs. Use it to drive visuals, animations, or any parameter that should react to sound.',
    tips: [
      'Increase smoothing (closer to 1) for slower, more stable readings; decrease it for snappier response.',
      'Map the bass output to scale or brightness for kick-driven visual effects.',
      'Place this after a gain node to control the analysis input level independently of the output volume.',
    ],
    pairsWith: ['audio-player', 'gain', 'oscillator', 'beat-detect'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const smoothing = (ctx.controls.get('smoothing') as number) ?? 0.8

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('level', -Infinity)
    outputs.set('bass', 0)
    outputs.set('mid', 0)
    outputs.set('high', 0)
    return outputs
  }

  // Get or create FFT analyzer
  const fft = getOrCreateNode(`${ctx.nodeId}_fft`, () => {
    const f = new Tone.FFT(256)
    f.smoothing = smoothing
    return f
  }) as Tone.FFT

  // Get or create meter
  const meter = getOrCreateNode(`${ctx.nodeId}_meter`, () => {
    return new Tone.Meter()
  }) as Tone.Meter

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(fft)
      prevInput.disconnect(meter)
    }
    audio.connect(fft)
    audio.connect(meter)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  // Get FFT data
  const fftData = fft.getValue()

  // Calculate frequency bands (simple averaging)
  const bassRange = Math.floor(fftData.length * 0.1) // 0-10%
  const midStart = bassRange
  const midEnd = Math.floor(fftData.length * 0.5) // 10-50%
  const highStart = midEnd

  let bass = 0, mid = 0, high = 0

  for (let i = 0; i < bassRange; i++) {
    bass += fftData[i] + 100 // Normalize from dB
  }
  bass = Math.max(0, bass / Math.max(1, bassRange) / 100)

  for (let i = midStart; i < midEnd; i++) {
    mid += fftData[i] + 100
  }
  mid = Math.max(0, mid / Math.max(1, midEnd - midStart) / 100)

  for (let i = highStart; i < fftData.length; i++) {
    high += fftData[i] + 100
  }
  high = Math.max(0, high / Math.max(1, fftData.length - highStart) / 100)

  const level = meter.getValue()
  const normalizedLevel = typeof level === 'number' ? level : level[0]

  const outputs = new Map<string, unknown>()
  outputs.set('level', normalizedLevel)
  outputs.set('bass', bass)
  outputs.set('mid', mid)
  outputs.set('high', high)
  return outputs
}

export default defineNode({ definition, executor })
