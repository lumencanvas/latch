import type { NodeDefinition } from '../types'

export const claspGestureNode: NodeDefinition = {
  id: 'clasp-gesture',
  name: 'CLASP Gesture',
  version: '1.0.0',
  category: 'connectivity',
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
}
