import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { templateExecutor } from '@/engine/executors/code'

const definition: NodeDefinition = {
  id: 'template',
  name: 'Template',
  version: '1.0.0',
  category: 'code',
  description: 'String template with variable interpolation',
  icon: 'text-cursor-input',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ],
  outputs: [
    { id: 'output', type: 'string', label: 'Output' },
  ],
  controls: [
    { id: 'template', type: 'text', label: 'Template', default: 'Value: {{a}}', props: { placeholder: 'Use {{varname}} for interpolation' } },
  ],
  info: {
    overview: 'Builds a string by replacing placeholders with live input values. Placeholders use double-brace syntax like {{a}} through {{d}}. Any input type is automatically converted to its string representation before insertion.',
    tips: [
      'Use template output to drive a textbox or console node for formatted debug displays.',
      'Combine with json-parse to build structured string payloads from multiple data sources.',
      'Placeholders for disconnected inputs resolve to an empty string, so unused slots are safe to leave in the template.',
    ],
    pairsWith: ['textbox', 'console', 'string-concat', 'json-parse'],
  },
}

export default defineNode({ definition, executor: templateExecutor })
