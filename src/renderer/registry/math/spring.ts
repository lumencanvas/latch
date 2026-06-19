import type { NodeDefinition } from '../types'

export const springNode: NodeDefinition = {
  id: 'spring',
  name: 'Spring',
  version: '1.0.0',
  category: 'math',
  description: 'Physics spring toward a target (mass / tension / friction) — natural overshoot and settle',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'target', type: 'number', label: 'Target' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'atRest', type: 'boolean', label: 'At Rest' },
  ],
  controls: [
    { id: 'tension', type: 'number', label: 'Tension', default: 120, props: { min: 1, max: 1000, step: 1 } },
    { id: 'friction', type: 'number', label: 'Friction', default: 14, props: { min: 0, max: 100, step: 1 } },
    { id: 'mass', type: 'number', label: 'Mass', default: 1, props: { min: 0.1, max: 20, step: 0.1 } },
  ],
  tags: ['spring', 'physics', 'damping', 'bounce', 'overshoot', 'smooth', 'follow', 'tween', 'motion', 'easing'],
  info: {
    overview:
      'Drives a value toward its Target with spring physics rather than a fixed curve — so it overshoots and settles like a real object. Lower Friction = bouncier; higher Mass = heavier/slower; Tension is the pull strength. Unlike Easing (fixed-duration curves) it responds continuously to a moving target, making it ideal for follow-the-cursor / follow-the-audio motion. Value is the position, Velocity the current speed, and At Rest fires once it settles.',
    tips: [
      'Wire a Slider, XY Pad, or audio level into Target for lively, organic following.',
      'Drop Friction toward 5–8 for pronounced bounce; raise it past ~25 for a smooth, no-overshoot ease.',
      'Pulse Reset to snap instantly to the target with no animation.',
      'Feed Velocity into a blur or shake amount so fast motion adds energy to the visuals.',
    ],
    pairsWith: ['slider', 'xy-pad', 'audio-analyzer', 'transform-2d', 'easing'],
  },
}
