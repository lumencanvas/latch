import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { svfState } from '../shared'

const definition: NodeDefinition = {
  id: 'svf-filter',
  name: 'SVF Filter',
  version: '1.0.0',
  category: 'audio',
  description: 'State Variable Filter with multiple outputs',
  icon: 'filter',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'cutoff', type: 'number', label: 'Cutoff' },
    { id: 'resonance', type: 'number', label: 'Resonance' },
  ],
  outputs: [
    { id: 'lowpass', type: 'audio', label: 'Lowpass' },
    { id: 'highpass', type: 'audio', label: 'Highpass' },
    { id: 'bandpass', type: 'audio', label: 'Bandpass' },
    { id: 'notch', type: 'audio', label: 'Notch' },
  ],
  controls: [
    {
      id: 'cutoff',
      type: 'number',
      label: 'Cutoff (Hz)',
      default: 1000,
      props: { min: 20, max: 20000, step: 1 },
    },
    {
      id: 'resonance',
      type: 'slider',
      label: 'Resonance',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'drive',
      type: 'slider',
      label: 'Drive',
      default: 0,
      props: { min: 0, max: 2, step: 0.01 },
    },
  ],
  info: {
    overview: 'A state variable filter that provides simultaneous lowpass, highpass, bandpass, and notch outputs from a single input. This lets you tap multiple filter shapes at once without duplicating nodes. Includes a drive control for mild saturation.',
    tips: [
      'Use the bandpass output for vocal or instrument isolation in a specific frequency range.',
      'Increase drive for warm saturation before the filter stage.',
      'Modulate the cutoff input with an LFO or envelope for evolving timbral movement.',
    ],
    pairsWith: ['oscillator', 'gain', 'envelope', 'filter', 'audio-output'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const cutoffInput = ctx.inputs.get('cutoff') as number | undefined
  const resonanceInput = ctx.inputs.get('resonance') as number | undefined

  const cutoff = cutoffInput ?? (ctx.controls.get('cutoff') as number) ?? 1000
  const resonance = resonanceInput ?? (ctx.controls.get('resonance') as number) ?? 0.5
  const driveAmount = (ctx.controls.get('drive') as number) ?? 0

  // Map resonance (0-1) to Q factor (0.5-20)
  const Q = 0.5 + resonance * 19.5

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('lowpass', null)
    outputs.set('highpass', null)
    outputs.set('bandpass', null)
    outputs.set('notch', null)
    return outputs
  }

  // Initialize or get state
  let state = svfState.get(ctx.nodeId)
  if (!state) {
    state = {
      lowpass: new Tone.Filter({ type: 'lowpass', frequency: cutoff, Q }),
      highpass: new Tone.Filter({ type: 'highpass', frequency: cutoff, Q }),
      bandpass: new Tone.Filter({ type: 'bandpass', frequency: cutoff, Q }),
      notch: new Tone.Filter({ type: 'notch', frequency: cutoff, Q }),
      drive: driveAmount > 0 ? new Tone.Distortion(driveAmount) : null,
      prevInput: null,
    }
    svfState.set(ctx.nodeId, state)
  }

  // Update filter parameters
  state.lowpass.frequency.value = cutoff
  state.lowpass.Q.value = Q
  state.highpass.frequency.value = cutoff
  state.highpass.Q.value = Q
  state.bandpass.frequency.value = cutoff
  state.bandpass.Q.value = Q
  state.notch.frequency.value = cutoff
  state.notch.Q.value = Q

  // Handle drive
  const hadDrive = state.drive !== null
  if (driveAmount > 0) {
    if (!state.drive) {
      state.drive = new Tone.Distortion(driveAmount)
    }
    state.drive.distortion = driveAmount
  } else if (state.drive) {
    // Drive was disabled - disconnect and dispose old drive node
    try {
      state.drive.disconnect()
    } catch { /* ignore */ }
    state.drive.dispose()
    state.drive = null
  }
  const hasDrive = state.drive !== null
  const driveStateChanged = hadDrive !== hasDrive

  // Connect input to all filters (via drive if enabled)
  // Also reconnect if drive state changed
  if (state.prevInput !== audio || driveStateChanged) {
    // Disconnect previous input based on PREVIOUS drive state (hadDrive)
    if (state.prevInput) {
      try {
        if (hadDrive) {
          // Was connected via drive - but drive may have been disposed, so just disconnect from filters
          state.prevInput.disconnect(state.lowpass)
          state.prevInput.disconnect(state.highpass)
          state.prevInput.disconnect(state.bandpass)
          state.prevInput.disconnect(state.notch)
        } else {
          state.prevInput.disconnect(state.lowpass)
          state.prevInput.disconnect(state.highpass)
          state.prevInput.disconnect(state.bandpass)
          state.prevInput.disconnect(state.notch)
        }
      } catch { /* ignore */ }
    }

    // Connect new input based on CURRENT drive state (hasDrive)
    if (hasDrive && state.drive) {
      audio.connect(state.drive)
      state.drive.connect(state.lowpass)
      state.drive.connect(state.highpass)
      state.drive.connect(state.bandpass)
      state.drive.connect(state.notch)
    } else {
      audio.connect(state.lowpass)
      audio.connect(state.highpass)
      audio.connect(state.bandpass)
      audio.connect(state.notch)
    }

    state.prevInput = audio
  }

  outputs.set('lowpass', state.lowpass)
  outputs.set('highpass', state.highpass)
  outputs.set('bandpass', state.bandpass)
  outputs.set('notch', state.notch)

  return outputs
}

export default defineNode({ definition, executor })
