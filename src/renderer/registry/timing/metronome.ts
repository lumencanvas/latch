import type { NodeDefinition } from '../types'

export const metronomeNode: NodeDefinition = {
  id: 'metronome',
  name: 'Metronome',
  version: '1.0.0',
  category: 'timing',
  description: 'Musical tempo source with beats and bars',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'start', type: 'trigger', label: 'Start' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
    { id: 'bpm', type: 'number', label: 'BPM' },
  ],
  outputs: [
    { id: 'beat', type: 'trigger', label: 'Beat' },
    { id: 'bar', type: 'trigger', label: 'Bar' },
    { id: 'beatNum', type: 'number', label: 'Beat #' },
    { id: 'barNum', type: 'number', label: 'Bar #' },
    { id: 'phase', type: 'number', label: 'Phase (0-1)' },
  ],
  controls: [
    { id: 'bpm', type: 'number', label: 'BPM', default: 120, props: { min: 20, max: 300, step: 1 } },
    { id: 'beatsPerBar', type: 'number', label: 'Beats/Bar', default: 4, props: { min: 1, max: 16, step: 1 } },
    {
      id: 'subdivision',
      type: 'select',
      label: 'Subdivision',
      default: '1',
      props: { options: ['1', '1/2', '1/4', '1/8', '1/16'] },
    },
    { id: 'swing', type: 'slider', label: 'Swing', default: 0, props: { min: 0, max: 100, step: 1 } },
    { id: 'running', type: 'toggle', label: 'Running', default: true },
  ],
}
