import type { NodeDefinition } from '../../types'

export const xyPadNode: NodeDefinition = {
  id: 'xy-pad',
  name: 'XY Pad',
  version: '1.0.0',
  category: 'inputs',
  description: '2D position controller with X/Y outputs',
  icon: 'move',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'rawX', type: 'number', label: 'Raw X' },
    { id: 'rawY', type: 'number', label: 'Raw Y' },
    { id: 'normX', type: 'number', label: '0-1 X' },
    { id: 'normY', type: 'number', label: '0-1 Y' },
  ],
  controls: [
    { id: 'normalizedX', type: 'number', label: 'X', default: 0.5, exposable: true },
    { id: 'normalizedY', type: 'number', label: 'Y', default: 0.5, exposable: true },
    { id: 'minX', type: 'number', label: 'Min X', default: 0 },
    { id: 'maxX', type: 'number', label: 'Max X', default: 1 },
    { id: 'minY', type: 'number', label: 'Min Y', default: 0 },
    { id: 'maxY', type: 'number', label: 'Max Y', default: 1 },
  ],
  // Declarative UI (Phase 3 bullet 2): the XY pad ↔ normalizedX/normalizedY via the built-in `xy`
  // Tier-B aggregate, plus the raw X/Y output readouts and the min/max range number controls. Replaces
  // XYPadNode.vue. Note: the raw readouts show live only while the graph runs (bespoke computed them at
  // rest), and the range controls render always-visible (bespoke had a collapsible RANGE section).
  ui: {
    rows: [
      { widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] },
      { widgets: [
        { type: 'readout', bind: 'rawX', source: 'output', label: 'X' },
        { type: 'readout', bind: 'rawY', source: 'output', label: 'Y' },
      ] },
      { label: 'Range', widgets: [
        { type: 'number', bind: 'minX', label: 'X Min' },
        { type: 'number', bind: 'maxX', label: 'X Max' },
      ] },
      { widgets: [
        { type: 'number', bind: 'minY', label: 'Y Min' },
        { type: 'number', bind: 'maxY', label: 'Y Max' },
      ] },
    ],
  },
  tags: ['xy pad', 'xy', 'pad', '2d', 'joystick', 'position', 'vector', 'touch'],
  info: {
    overview: 'A two-dimensional pad that outputs X and Y positions in both raw and normalized forms. The raw outputs use the configured min/max ranges while the normalized outputs always produce 0-to-1 values. This is ideal for controlling two parameters simultaneously with a single gesture.',
    tips: [
      'Map normalized X and Y to different shader uniforms for interactive 2D visual control.',
      'Set asymmetric min/max ranges to bias the raw output toward a useful operating region.',
      'Connect each axis to a smooth node independently to get different smoothing rates for X and Y.',
    ],
    pairsWith: ['smooth', 'shader', 'map-range', 'oscillator'],
  },
}
