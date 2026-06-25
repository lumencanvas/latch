import type { NodeDefinition } from '../types'

export const tweenToTargetNode: NodeDefinition = {
  id: 'tween-to-target',
  name: 'Tween To Target',
  version: '1.0.0',
  category: 'math',
  description: 'Smoothly ease toward a moving target value (frame-rate independent).',
  icon: 'move-right',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'target', type: 'number', label: 'Target' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'arrived', type: 'boolean', label: 'Arrived' },
  ],
  controls: [
    { id: 'target', type: 'number', label: 'Target', default: 0 },
    { id: 'speed', type: 'number', label: 'Speed', default: 5, props: { min: 0, max: 50, step: 0.1 } },
  ],
  tags: ['tween', 'ease', 'lerp', 'smooth', 'follow', 'approach', 'damp', 'math'],
  info: {
    overview:
      'Continuously eases its output toward the Target with an exponential approach — fast at first, slowing as it arrives — and stays consistent across frame rates. Unlike the Easing node (fixed-duration curve on a 0–1 input) it tracks a target that keeps moving. Arrived fires once it settles.',
    tips: [
      'Higher Speed snaps faster; low Speed gives long, lazy follows.',
      'Wire a Slider, XY Pad, or audio value into Target for organic following. Use Spring instead if you want overshoot/bounce.',
    ],
    pairsWith: ['slider', 'xy-pad', 'spring', 'easing'],
  },
}
