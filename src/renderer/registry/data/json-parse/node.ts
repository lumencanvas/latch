import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { jsonParseExecutor } from '@/engine/executors/connectivity'

const definition: NodeDefinition = {
  id: 'json-parse',
  name: 'JSON Parse',
  version: '1.0.0',
  category: 'data',
  description: 'Parse JSON string to object',
  icon: 'braces',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'JSON String' },
  ],
  outputs: [
    { id: 'output', type: 'data', label: 'Object' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'path', type: 'text', label: 'Path', default: '', props: { placeholder: 'e.g., data.items[0]' } },
  ],
  info: {
    overview: 'Parses a JSON string into a structured object. Optionally extracts a nested value using a dot-notation path. If parsing fails, the error output provides the reason.',
    tips: [
      'Use the path field to drill into deeply nested responses without needing separate Object Get nodes.',
      'Connect the error output to a Monitor node to debug malformed JSON from external sources.',
    ],
    pairsWith: ['json-stringify', 'object-get', 'http-request', 'monitor'],
  },
}

export default defineNode({ definition, executor: jsonParseExecutor })
