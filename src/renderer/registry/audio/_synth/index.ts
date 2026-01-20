import type { NodeDefinition } from '../../types'

export const synthNode: NodeDefinition = {
  id: 'synth',
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
    { id: 'sustain', type: 'number', label: 'Sustain', default: 0.7, props: { min: 0, max: 1, step: 0.01 } },
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
}

// Export the custom node component
export { default as SynthNode } from './SynthNode.vue'
