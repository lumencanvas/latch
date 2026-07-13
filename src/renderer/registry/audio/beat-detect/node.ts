import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, beatState, getOrCreateNode } from '../shared'

const definition: NodeDefinition = {
  id: 'beat-detect',
  name: 'Beat Detect',
  version: '1.0.0',
  category: 'audio',
  description: 'Detect beats and estimate BPM',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { id: 'beat', type: 'trigger', label: 'Beat' },
    { id: 'bpm', type: 'number', label: 'BPM' },
    { id: 'energy', type: 'number', label: 'Energy' },
  ],
  controls: [
    { id: 'sensitivity', type: 'slider', label: 'Sensitivity', default: 1.5, props: { min: 1, max: 3, step: 0.1 } },
    { id: 'minInterval', type: 'number', label: 'Min Interval (ms)', default: 200, props: { min: 50, max: 500 } },
    { id: 'decayRate', type: 'slider', label: 'Decay Rate', default: 0.95, props: { min: 0.8, max: 0.99, step: 0.01 } },
  ],
  tags: ['beat', 'beat detect', 'bpm', 'tempo', 'onset', 'kick', 'rhythm', 'audio reactive'],
  info: {
    overview: 'Analyzes an audio signal to detect rhythmic beats and estimate the tempo in BPM. Outputs a trigger on each detected beat, the current BPM estimate, and the instantaneous energy level.',
    tips: [
      'Lower sensitivity to reduce false triggers on complex, busy audio material.',
      'Increase min interval to reject double-triggers on fast transients.',
      'Connect the beat trigger to an envelope or visual parameter for beat-synced animations.',
    ],
    pairsWith: ['audio-player', 'audio-analyzer', 'envelope', 'gain'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const sensitivity = (ctx.controls.get('sensitivity') as number) ?? 1.5
  const minInterval = (ctx.controls.get('minInterval') as number) ?? 200 // ms between beats
  const decayRate = (ctx.controls.get('decayRate') as number) ?? 0.95

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('beat', false)
    outputs.set('bpm', 0)
    outputs.set('energy', 0)
    return outputs
  }

  // Get or create FFT analyzer for this node
  const fft = getOrCreateNode(`${ctx.nodeId}_fft`, () => {
    const f = new Tone.FFT(256)
    return f
  }) as Tone.FFT

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(fft)
    }
    audio.connect(fft)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  // Initialize state if needed
  if (!beatState.has(ctx.nodeId)) {
    beatState.set(ctx.nodeId, {
      lastEnergy: 0,
      threshold: 0,
      lastBeatTime: 0,
      bpm: 0,
      beatTimes: [],
    })
  }

  const state = beatState.get(ctx.nodeId)!
  const now = performance.now()

  // Get FFT data and calculate energy (focus on bass frequencies for beat detection)
  const fftData = fft.getValue()
  const bassEnd = Math.floor(fftData.length * 0.15) // Focus on low frequencies

  let energy = 0
  for (let i = 0; i < bassEnd; i++) {
    const val = fftData[i] + 100 // Normalize from dB
    energy += val * val
  }
  energy = Math.sqrt(energy / Math.max(1, bassEnd)) / 100

  // Update adaptive threshold
  state.threshold = state.threshold * decayRate + energy * (1 - decayRate)

  // Detect beat
  const timeSinceLastBeat = now - state.lastBeatTime
  const isBeat =
    energy > state.threshold * sensitivity &&
    energy > state.lastEnergy &&
    timeSinceLastBeat > minInterval

  if (isBeat) {
    state.lastBeatTime = now

    // Track beat times for BPM calculation (keep last 10 beats)
    state.beatTimes.push(now)
    if (state.beatTimes.length > 10) {
      state.beatTimes.shift()
    }

    // Calculate BPM from beat intervals
    if (state.beatTimes.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < state.beatTimes.length; i++) {
        intervals.push(state.beatTimes[i] - state.beatTimes[i - 1])
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      state.bpm = Math.round(60000 / avgInterval)

      // Clamp to reasonable BPM range
      if (state.bpm < 60) state.bpm *= 2
      if (state.bpm > 200) state.bpm = Math.round(state.bpm / 2)
    }
  }

  state.lastEnergy = energy

  const outputs = new Map<string, unknown>()
  outputs.set('beat', isBeat)
  outputs.set('bpm', state.bpm)
  outputs.set('energy', energy)
  return outputs
}

export default defineNode({ definition, executor })
