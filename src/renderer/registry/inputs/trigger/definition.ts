import type { NodeDefinition } from '@/stores/nodes'

export const triggerNode: NodeDefinition = {
  id: 'trigger',
  name: 'Trigger',
  version: '1.0.0',
  category: 'inputs',
  description: 'Manual trigger button with various output types',
  icon: 'zap',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
  controls: [
    { id: 'outputType', type: 'select', label: 'Type', default: 'boolean', props: { options: ['boolean', 'number', 'string', 'json', 'timestamp'] } },
    { id: 'value', type: 'toggle', label: 'Value', default: false },
    { id: 'stringValue', type: 'text', label: 'String Value', default: '' },
    { id: 'jsonValue', type: 'text', label: 'JSON Value', default: '{}' },
  ],
  tags: ['trigger', 'button', 'bang', 'pulse', 'fire', 'gate', 'manual'],
  info: {
    overview: 'A manual button that fires a trigger signal when clicked. It supports multiple output types including boolean, number, string, JSON, and timestamp. This makes it useful for both simple fire-and-forget pulses and sending specific data payloads on demand.',
    tips: [
      'Use timestamp mode to tag events with the exact time they were triggered.',
      'Set the type to JSON and provide a payload to send structured data to downstream nodes with one click.',
      'Connect multiple trigger nodes to a counter for a manual step-through interface.',
    ],
    pairsWith: ['counter', 'toggle', 'sample-hold', 'gate'],
  },
}
