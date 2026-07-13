import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { pitchState } from '../shared'

const definition: NodeDefinition = {
  id: 'pitch-detect',
  name: 'Pitch Detect',
  version: '1.0.0',
  category: 'audio',
  description: 'Detect pitch from audio input',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'frequency', type: 'number', label: 'Frequency (Hz)' },
    { id: 'note', type: 'string', label: 'Note' },
    { id: 'octave', type: 'number', label: 'Octave' },
    { id: 'midi', type: 'number', label: 'MIDI' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
  ],
  controls: [
    {
      id: 'minFreq',
      type: 'number',
      label: 'Min Freq',
      default: 50,
      props: { min: 20, max: 1000, step: 1 },
    },
    {
      id: 'maxFreq',
      type: 'number',
      label: 'Max Freq',
      default: 2000,
      props: { min: 100, max: 10000, step: 1 },
    },
  ],
  info: {
    overview: 'Analyzes an audio signal to estimate its fundamental pitch. Outputs the detected frequency in Hz, the musical note name, octave number, MIDI note value, and a confidence score indicating detection reliability.',
    tips: [
      'Narrow the min/max frequency range to improve accuracy for a known instrument or voice.',
      'Use the confidence output to gate downstream processing so only strong detections pass through.',
      'Feed the MIDI output into a synth node to create a pitch-following harmonizer.',
    ],
    pairsWith: ['audio-player', 'audio-analyzer', 'synth', 'oscillator'],
  },
}

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function autoCorrelate(buffer: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): { frequency: number; confidence: number } {
  const size = buffer.length
  let maxCorrelation = 0
  let bestOffset = -1

  // Find the DC offset
  let sum = 0
  for (let i = 0; i < size; i++) {
    sum += buffer[i]
  }
  const dc = sum / size

  // Copy buffer and remove DC offset to avoid mutating input
  const processed = new Float32Array(size)
  let rms = 0
  for (let i = 0; i < size; i++) {
    processed[i] = buffer[i] - dc
    rms += processed[i] * processed[i]
  }
  rms = Math.sqrt(rms / size)

  // Not enough signal
  if (rms < 0.01) {
    return { frequency: 0, confidence: 0 }
  }

  const minPeriod = Math.floor(sampleRate / maxFreq)
  const maxPeriod = Math.floor(sampleRate / minFreq)

  // Autocorrelation
  for (let offset = minPeriod; offset < Math.min(maxPeriod, size); offset++) {
    let correlation = 0
    for (let i = 0; i < size - offset; i++) {
      correlation += processed[i] * processed[i + offset]
    }
    correlation /= size - offset

    if (correlation > maxCorrelation) {
      maxCorrelation = correlation
      bestOffset = offset
    }
  }

  if (bestOffset === -1) {
    return { frequency: 0, confidence: 0 }
  }

  const frequency = sampleRate / bestOffset
  const confidence = maxCorrelation / rms

  return { frequency, confidence: Math.min(1, confidence) }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const minFreq = (ctx.controls.get('minFreq') as number) ?? 50
  const maxFreq = (ctx.controls.get('maxFreq') as number) ?? 2000

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('frequency', 0)
    outputs.set('note', '')
    outputs.set('octave', 0)
    outputs.set('midi', 0)
    outputs.set('confidence', 0)
    return outputs
  }

  // Initialize state
  let state = pitchState.get(ctx.nodeId)
  if (!state) {
    const audioContext = Tone.getContext().rawContext as AudioContext
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048

    // Create buffer with explicit ArrayBuffer to ensure correct type
    const arrayBuffer = new ArrayBuffer(analyser.fftSize * 4) // 4 bytes per float
    const buffer = new Float32Array(arrayBuffer)

    state = {
      analyser,
      audioContext,
      buffer,
      prevInput: null,
      lastFreq: 0,
      lastConfidence: 0,
    }
    pitchState.set(ctx.nodeId, state)
  }

  // Connect input
  if (state.prevInput !== audio) {
    if (state.prevInput) {
      try {
        (state.prevInput as unknown as { disconnect: (node: AudioNode) => void }).disconnect(state.analyser!)
      } catch { /* ignore */ }
    }

    try {
      (audio as unknown as { connect: (node: AudioNode) => void }).connect(state.analyser!)
    } catch { /* ignore */ }

    state.prevInput = audio
  }

  // Get time domain data
  state.analyser!.getFloatTimeDomainData(state.buffer!)

  // Detect pitch
  const { frequency, confidence } = autoCorrelate(
    state.buffer!,
    state.audioContext!.sampleRate,
    minFreq,
    maxFreq
  )

  // Smooth the frequency
  const smoothedFreq = frequency > 0 ? frequency : state.lastFreq * 0.95
  state.lastFreq = smoothedFreq
  state.lastConfidence = confidence

  // Calculate note and octave from frequency
  let note = ''
  let octave = 0
  let midi = 0

  if (smoothedFreq > 0) {
    midi = Math.round(12 * Math.log2(smoothedFreq / 440) + 69)
    note = noteNames[midi % 12]
    octave = Math.floor(midi / 12) - 1
  }

  outputs.set('frequency', Math.round(smoothedFreq * 10) / 10)
  outputs.set('note', note)
  outputs.set('octave', octave)
  outputs.set('midi', midi)
  outputs.set('confidence', Math.round(confidence * 100) / 100)

  return outputs
}

export default defineNode({ definition, executor })
