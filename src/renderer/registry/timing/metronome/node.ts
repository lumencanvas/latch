import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { metronomeExecutor } from '@/engine/executors/timing'

const definition: NodeDefinition = {
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
  tags: ['metronome', 'tempo', 'bpm', 'clock', 'beat', 'pulse', 'timing'],
  info: {
    overview: 'A musical clock that emits beat and bar triggers at a given BPM. Beat fires on every tick of the chosen Subdivision (1/4 = four ticks per beat), while Beat # counts musical beats within the bar (1…Beats/Bar) and Bar # counts bars. Phase runs 0→1 between ticks. Tempo changes are smooth (no jumps), and Swing delays every second tick.',
    tips: [
      'Use the phase output with a map-range node to create smooth animations that lock to the beat.',
      'Swing delays every second tick (the off-beat); with subdivision 1/2 or 1/4 that gives classic swung eighths / sixteenths.',
      'Feed the bar trigger into a step-sequencer reset input to keep patterns aligned across changes.',
    ],
    pairsWith: ['step-sequencer', 'beat-detect', 'envelope', 'counter', 'lfo'],
  },
}

export default defineNode({ definition, executor: metronomeExecutor })
