import type { NodeDefinition } from '../types'

export const midiOutputNode: NodeDefinition = {
  id: 'midi-output',
  name: 'MIDI Output',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Send MIDI messages to devices',
  icon: 'music',
  platforms: ['web', 'electron'],
  requires: ['midi'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [
    { id: 'connected', type: 'boolean', label: 'Connected' },
  ],
  controls: [
    { id: 'channel', type: 'number', label: 'Channel', default: 0, props: { min: 0, max: 15 } },
  ],
  tags: ['midi', 'output', 'send', 'cc', 'notes', 'music', 'hardware'],
  info: {
    overview: 'Sends MIDI note messages to connected hardware or virtual MIDI devices. Provide a note number and velocity, then trigger the send. Useful for controlling synthesizers, lighting rigs, or any MIDI-compatible equipment from a flow.',
    tips: [
      'Connect a trigger node to control the exact timing of note events.',
      'Use velocity values between 0 and 127 to control note dynamics.',
      'Combine with a MIDI Input node to create MIDI filtering or remapping flows.',
    ],
    pairsWith: ['midi-input', 'trigger', 'expression', 'oscillator', 'function'],
  },
}
