import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { synthState, getOrCreateNode } from '../shared'
import SynthNode from './SynthNode.vue'

const definition: NodeDefinition = {
  id: 'synth',
  component: markRaw(SynthNode),
  name: 'Synth',
  version: '1.0.0',
  category: 'audio',
  description: 'Synthesizer that plays MIDI notes with different instrument sounds',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    {
      id: 'instrument',
      type: 'select',
      label: 'Instrument',
      default: 'sine',
      props: {
        options: ['sine', 'moog', 'piano', 'organ', 'pluck', 'pad'],
      },
    },
    { id: 'volume', type: 'number', label: 'Volume', default: -6, props: { min: -60, max: 0, step: 1 } },
    // Envelope (shared)
    { id: 'attack', type: 'number', label: 'Attack', default: 0.01, props: { min: 0.001, max: 2, step: 0.001 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 0.1, props: { min: 0.001, max: 2, step: 0.001 } },
    { id: 'sustain', type: 'number', label: 'Sustain', default: 0.01, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'release', type: 'number', label: 'Release', default: 0.3, props: { min: 0.001, max: 5, step: 0.001 } },
    // Moog-specific
    { id: 'cutoff', type: 'number', label: 'Cutoff', default: 2000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'resonance', type: 'number', label: 'Resonance', default: 1, props: { min: 0.1, max: 30, step: 0.1 } },
    { id: 'filterEnv', type: 'number', label: 'Filter Env', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    // Pluck-specific
    { id: 'brightness', type: 'number', label: 'Brightness', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'damping', type: 'number', label: 'Damping', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    // Pad-specific
    { id: 'detune', type: 'number', label: 'Detune', default: 10, props: { min: 0, max: 50, step: 1 } },
    { id: 'voices', type: 'number', label: 'Voices', default: 3, props: { min: 1, max: 8, step: 1 } },
  ],
  info: {
    overview: 'An all-in-one synthesizer that responds to MIDI note, velocity, and gate inputs. Includes six instrument presets ranging from simple sine to moog bass, piano, organ, pluck, and pad. Each preset exposes relevant parameters like filter cutoff, brightness, and voice count.',
    tips: [
      'Use the gate input for held notes and the trigger input for one-shot percussive hits.',
      'Switch to the moog preset and lower the cutoff for classic acid bass lines.',
      'Increase voices and detune on the pad preset for wide, lush chord textures.',
    ],
    pairsWith: ['midi-input', 'envelope', 'audio-output', 'reverb', 'gain'],
  },
}

function createSynthForInstrument(instrument: string): Tone.Synth | Tone.MonoSynth | Tone.FMSynth | Tone.AMSynth {
  switch (instrument) {
    case 'moog':
      return new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, baseFrequency: 200, octaves: 4 },
      })
    case 'piano':
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 1.5 },
      })
    case 'organ':
      return new Tone.AMSynth({
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.5 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 },
      })
    case 'pluck':
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
      })
    case 'pad':
      return new Tone.FMSynth({
        harmonicity: 3,
        modulationIndex: 10,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 2 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.5, decay: 0.1, sustain: 0.5, release: 0.5 },
      })
    case 'sine':
    default:
      return new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
      })
  }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Get inputs from connected nodes
  const note = (ctx.inputs.get('note') as number) ?? (ctx.controls.get('note') as number) ?? 60
  const velocity = (ctx.inputs.get('velocity') as number) ?? (ctx.controls.get('velocity') as number) ?? 100
  const gate = (ctx.inputs.get('gate') as boolean) ?? (ctx.controls.get('gate') as boolean) ?? false
  const trigger = ctx.inputs.get('trigger')

  // Get control settings
  const instrument = (ctx.controls.get('instrument') as string) ?? 'sine'
  const volume = (ctx.controls.get('volume') as number) ?? -6
  const attack = (ctx.controls.get('attack') as number) ?? 0.01
  const decay = (ctx.controls.get('decay') as number) ?? 0.1
  const sustain = (ctx.controls.get('sustain') as number) ?? 0.7
  const release = (ctx.controls.get('release') as number) ?? 0.3

  // Initialize state
  let state = synthState.get(ctx.nodeId)
  if (!state) {
    state = {
      voices: new Map(),
      instrument,
      prevGate: false,
      prevNote: 0,
    }
    synthState.set(ctx.nodeId, state)
  }

  // Check if instrument changed - dispose old voices
  if (state.instrument !== instrument) {
    for (const voice of state.voices.values()) {
      voice.synth.dispose()
    }
    state.voices.clear()
    state.instrument = instrument
  }

  // Convert MIDI note to frequency
  const freq = Tone.Frequency(note, 'midi').toFrequency()

  // Get or create main output gain
  const outputGain = getOrCreateNode(`${ctx.nodeId}_output`, () => {
    const gain = new Tone.Gain(Tone.dbToGain(volume))
    return gain
  }) as Tone.Gain

  // Update volume
  outputGain.gain.value = Tone.dbToGain(volume)

  // Handle gate changes (note on/off)
  const gateRising = gate && !state.prevGate
  const gateFalling = !gate && state.prevGate
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  // Note on
  if (gateRising || hasTrigger) {
    // Stop any existing voice for this note
    const existingVoice = state.voices.get(note)
    if (existingVoice) {
      existingVoice.synth.triggerRelease()
      existingVoice.synth.dispose()
      state.voices.delete(note)
    }

    // Create new voice
    const synth = createSynthForInstrument(instrument)

    // Update envelope if accessible
    if ('envelope' in synth) {
      synth.envelope.attack = attack
      synth.envelope.decay = decay
      synth.envelope.sustain = sustain
      synth.envelope.release = release
    }

    synth.volume.value = -6 // Individual voice volume
    synth.connect(outputGain)

    // Calculate velocity (0-127 to 0-1)
    const vel = Math.min(1, Math.max(0, velocity / 127))
    synth.triggerAttack(freq, Tone.now(), vel)

    state.voices.set(note, { synth, note })
  }

  // Note off
  if (gateFalling) {
    const voice = state.voices.get(state.prevNote)
    if (voice) {
      voice.synth.triggerRelease()
      // Schedule cleanup after release
      setTimeout(() => {
        voice.synth.dispose()
        state!.voices.delete(state!.prevNote)
      }, (release + 0.1) * 1000)
    }
  }

  state.prevGate = gate
  state.prevNote = note

  const outputs = new Map<string, unknown>()
  outputs.set('audio', outputGain)
  return outputs
}

export default defineNode({ definition, executor })
