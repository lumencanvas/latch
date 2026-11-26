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
    { id: 'spectrum', type: 'data', label: 'Spectrum (32 bands, 0–1)' },
  ],
  controls: [
    { id: 'smoothing', type: 'number', label: 'Smoothing', default: 0.8, props: { min: 0, max: 0.99, step: 0.01 } },
  ],
  info: {
    overview: 'Splits an incoming audio signal into level, bass, mid, and high frequency bands as numeric outputs. Use it to drive visuals, animations, or any parameter that should react to sound.',
    tips: [
      'Increase smoothing (up to 0.99) for slower, more stable readings; decrease it for snappier response. At 1 the readings would never change, so 0.99 is the limit.',
      'Map the bass output to scale or brightness for kick-driven visual effects.',
      'Place this after a gain node to control the analysis input level independently of the output volume.',
    ],
    pairsWith: ['audio-player', 'gain', 'oscillator', 'beat-detect'],
  },
}

/** FFT dB bins → `n` log-spaced bands, 0..1 (−90 dB → 0, −20 dB → 1: the range music actually uses). Pure (tested). */
export function spectrumBands(fft: ArrayLike<number>, n: number): number[] {
  const bins = fft.length
  const out: number[] = []
  if (bins < 2) return out
  for (let b = 0; b < n; b++) {
    const lo = Math.max(1, Math.floor(Math.pow(bins, b / n)))
    const hi = Math.max(lo + 1, Math.floor(Math.pow(bins, (b + 1) / n)))
    let sum = 0, k = 0
    for (let i = lo; i < Math.min(hi, bins); i++) { sum += fft[i]; k++ }
    const db = k ? sum / k : -100
    out.push(Math.max(0, Math.min(1, (db + 90) / 70)))
  }
  return out
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  // 1 would freeze the analyser at its first frame forever: cap it (flows saved with 1 included).
  const rawSmoothing = Number(ctx.controls.get('smoothing') ?? 0.8)
  const smoothing = Number.isFinite(rawSmoothing) ? Math.min(0.99, Math.max(0, rawSmoothing)) : 0.8

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('level', -Infinity)
    outputs.set('bass', 0)
    outputs.set('mid', 0)
    outputs.set('high', 0)
    outputs.set('spectrum', [])
    return outputs
  }

  // Get or create FFT analyzer
  const fft = getOrCreateNode(`${ctx.nodeId}_fft`, () => {
    const f = new Tone.FFT(256)
    f.smoothing = smoothing
    return f
  }) as Tone.FFT

  // Smoothing is a control — apply edits after creation too (was only read in the factory).
  if (fft.smoothing !== smoothing) fft.smoothing = smoothing

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
  outputs.set('spectrum', spectrumBands(fftData, 32))
  return outputs
}

export default defineNode({ definition, executor })
