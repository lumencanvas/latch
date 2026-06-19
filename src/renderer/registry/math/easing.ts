import type { NodeDefinition } from '../types'

export const easingNode: NodeDefinition = {
  id: 'easing',
  name: 'Easing',
  version: '1.0.0',
  category: 'math',
  description: 'Shape a 0–1 value through an easing curve (ease in/out, back, elastic, bounce)',
  icon: 'spline',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 't', type: 'number', label: 'T' },
  ],
  outputs: [
    { id: 'value', type: 'number', label: 'Value' },
  ],
  controls: [
    {
      id: 'curve',
      type: 'select',
      label: 'Curve',
      default: 'in-out-cubic',
      // Keep in sync with EASINGS in engine/executors/easing.ts.
      props: {
        options: [
          'linear',
          'in-quad', 'out-quad', 'in-out-quad',
          'in-cubic', 'out-cubic', 'in-out-cubic',
          'in-sine', 'out-sine', 'in-out-sine',
          'in-expo', 'out-expo', 'in-out-expo',
          'in-back', 'out-back', 'in-out-back',
          'in-elastic', 'out-elastic',
          'in-bounce', 'out-bounce',
        ],
      },
    },
    { id: 'clampInput', type: 'toggle', label: 'Clamp Input', default: true },
  ],
  tags: ['easing', 'ease', 'curve', 'tween', 'interpolation', 'animation', 'shaper', 'smooth', 'bounce', 'elastic', 'back'],
  info: {
    overview:
      'Maps a 0–1 input through a classic easing curve, giving motion character — accelerate in, decelerate out, overshoot (back), spring (elastic), or settle (bounce). Drop it between any 0–1 signal (LFO, Noise, an envelope, a normalized Counter) and whatever it drives. Back/elastic curves intentionally overshoot the 0–1 range; turn off Clamp Input to extrapolate beyond the ends.',
    tips: [
      'Feed a linear ramp (Time → Map Range to 0–1) in, and the eased output drives natural-looking motion.',
      'out-back and out-elastic add a lively overshoot to transitions; out-bounce settles like a dropped ball.',
      'Chain after an LFO to turn a plain sine into a punchier, shaped pulse.',
      'It complements Smoothstep (a single fixed curve) with a whole library of shapes.',
    ],
    pairsWith: ['lfo', 'noise', 'map-range', 'envelope', 'transform-2d'],
  },
}
