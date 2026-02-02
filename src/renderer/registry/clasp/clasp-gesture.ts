import type { NodeDefinition } from '../types'

export const claspGestureNode: NodeDefinition = {
  id: 'clasp-gesture',
  name: 'CLASP Gesture',
  version: '1.0.0',
  category: 'clasp',
  description: 'Receive gesture signals (touch/pen/motion) from CLASP',
  icon: 'hand',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
  ],
  outputs: [
    { id: 'x', type: 'number', label: 'X' },
    { id: 'y', type: 'number', label: 'Y' },
    { id: 'pressure', type: 'number', label: 'Pressure' },
    { id: 'phase', type: 'string', label: 'Phase' },
    { id: 'pointerType', type: 'string', label: 'Pointer Type' },
    { id: 'updated', type: 'boolean', label: 'Updated' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'pattern', type: 'text', label: 'Pattern', default: '/gesture/**', props: { placeholder: '/gesture/**' } },
  ],
  tags: ['clasp', 'gesture', 'touch', 'pen', 'motion', 'input'],
  info: {
    overview: 'Receives gesture input signals such as touch, pen, and motion events from a CLASP server. Outputs include X/Y coordinates, pressure, pointer phase, and pointer type. Use it to build interactive control surfaces or visualizations driven by remote input.',
    tips: [
      'Use the pattern field to filter for specific gesture paths like /gesture/pen/**.',
      'Check the Phase output to distinguish between start, move, and end events.',
      'Combine pressure output with a gain node to create pressure-sensitive controls.',
    ],
    pairsWith: ['clasp-connection', 'clasp-subscribe', 'expression', 'monitor'],
  },
}
