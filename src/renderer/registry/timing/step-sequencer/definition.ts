import type { NodeDefinition } from '../../types'

export const stepSequencerNode: NodeDefinition = {
  id: 'step-sequencer',
  name: 'Step Sequencer',
  version: '1.0.0',
  category: 'timing',
  description: 'Step-based pattern sequencer for rhythm and automation',
  icon: 'grid-3x3',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'clock', type: 'trigger', label: 'Clock' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'gate', type: 'trigger', label: 'Gate' },
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'step', type: 'number', label: 'Step #' },
  ],
  controls: [
    { id: 'steps', type: 'number', label: 'Steps', default: 8, props: { min: 1, max: 64, step: 1 } },
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'Forward',
      props: { options: ['Forward', 'Backward', 'Ping-Pong', 'Random'] },
    },
    // Step values are stored as an array in the node data
    { id: 'stepValues', type: 'data', label: 'Step Values', default: [] },
  ],
  tags: ['sequencer', 'step sequencer', 'pattern', 'steps', 'gate', 'rhythm', 'trigger'],
  info: {
    overview: 'A pattern sequencer that advances through a configurable number of steps on each incoming clock trigger. Each step holds a value and a gate state. Supports forward, backward, ping-pong, and random playback modes.',
    tips: [
      'Feed the clock input from a metronome beat output to keep the sequence locked to tempo.',
      'Use the value output to drive shader uniforms or color parameters for rhythmic visual changes.',
      'Ping-pong mode doubles the effective pattern length without needing twice as many steps.',
    ],
    pairsWith: ['metronome', 'shader', 'envelope', 'counter', 'lfo'],
  },
}
