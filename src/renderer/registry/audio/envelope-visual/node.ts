import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { envelopeVisualExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
  id: 'envelope-visual',
  name: 'Envelope Editor',
  version: '1.0.0',
  category: 'audio',
  description: 'Visual ADSR envelope with draggable curve control points',
  icon: 'trending-up',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
    { id: 'release', type: 'trigger', label: 'Release' },
  ],
  outputs: [
    { id: 'envelope', type: 'audio', label: 'Envelope' },
    { id: 'value', type: 'number', label: 'Value' },
  ],
  controls: [
    { id: 'attack', type: 'number', label: 'Attack', default: 0.01, props: { min: 0.001, max: 2, step: 0.001 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 0.1, props: { min: 0.001, max: 2, step: 0.001 } },
    { id: 'sustain', type: 'number', label: 'Sustain', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'release', type: 'number', label: 'Release', default: 0.3, props: { min: 0.001, max: 5, step: 0.001 } },
  ],
  // Declarative UI (Phase 3 bullet 2): the whole body is the EnvelopeEditor bound to the 4 ADSR
  // controls, so it's expressible as the built-in `env` Tier-B aggregate — no bespoke SFC needed.
  // Fields are positional in ENV_ORDER (attack, decay, sustain, release). Replaces EnvelopeVisualNode.vue.
  ui: {
    rows: [
      { widgets: [{ type: 'env', bind: '', props: { fields: ['attack', 'decay', 'sustain', 'release'] } }] },
    ],
  },
  info: {
    overview: 'A visual ADSR envelope editor with draggable control points for shaping attack, decay, sustain, and release curves. Functions identically to the standard Envelope node but adds an interactive graphical display for intuitive editing.',
    tips: [
      'Drag the control points directly on the curve for faster, more intuitive shaping than typing numbers.',
      'Use this node in place of the plain Envelope when you want visual feedback during design.',
      'Connect the value output to visual parameters for real-time envelope monitoring.',
    ],
    pairsWith: ['oscillator', 'gain', 'filter', 'synth', 'beat-detect'],
  },
}

export default defineNode({ definition, executor: envelopeVisualExecutor })
