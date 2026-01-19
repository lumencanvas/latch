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
}
