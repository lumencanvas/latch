import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { parametricEqExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
  id: 'parametric-eq',
  name: 'Parametric EQ',
  version: '1.0.0',
  category: 'audio',
  description: '3-band parametric equalizer with visual frequency response and draggable bands',
  icon: 'sliders-horizontal',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    // Band 1 (Low)
    { id: 'freq1', type: 'number', label: 'Freq 1', default: 200, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain1', type: 'number', label: 'Gain 1', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q1', type: 'number', label: 'Q 1', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
    // Band 2 (Mid)
    { id: 'freq2', type: 'number', label: 'Freq 2', default: 1000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain2', type: 'number', label: 'Gain 2', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q2', type: 'number', label: 'Q 2', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
    // Band 3 (High)
    { id: 'freq3', type: 'number', label: 'Freq 3', default: 5000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain3', type: 'number', label: 'Gain 3', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q3', type: 'number', label: 'Q 3', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
  ],
  // Declarative UI (Phase 3 bullet 2): the whole body is the EQEditor bound to the 9 flat band
  // controls, so it's expressible as the built-in `eq` Tier-B aggregate — no bespoke SFC needed.
  // Fields are positional, chunked by 3 into bands (freq,gain,q per band). Replaces ParametricEqNode.vue.
  ui: {
    rows: [
      { widgets: [{ type: 'eq', bind: '', props: { fields: ['freq1', 'gain1', 'q1', 'freq2', 'gain2', 'q2', 'freq3', 'gain3', 'q3'] } }] },
    ],
  },
  info: {
    overview: 'A 3-band parametric equalizer with a visual frequency response display and draggable band controls. Each band has independent frequency, gain, and Q settings for precise tonal shaping across the low, mid, and high ranges.',
    tips: [
      'Drag the band handles in the visual display for quick, intuitive adjustments.',
      'Cut narrow bands (high Q, negative gain) to remove problem frequencies rather than boosting others.',
      'Use gentle broad boosts (low Q, small positive gain) for overall tonal warmth or brightness.',
    ],
    pairsWith: ['audio-player', 'gain', 'audio-output', 'reverb', 'filter'],
  },
}

export default defineNode({ definition, executor: parametricEqExecutor })
