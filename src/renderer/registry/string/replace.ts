import type { NodeDefinition } from '../types'

export const stringReplaceNode: NodeDefinition = {
  id: 'string-replace',
  name: 'String Replace',
  version: '1.0.0',
  category: 'string',
  description: 'Replace text in a string',
  icon: 'replace',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'search', type: 'string', label: 'Search' },
    { id: 'replace', type: 'string', label: 'Replace' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
    { id: '_error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'search', type: 'text', label: 'Search', default: '' },
    { id: 'replace', type: 'text', label: 'Replace', default: '' },
    { id: 'useRegex', type: 'toggle', label: 'Use Regex', default: false },
    { id: 'replaceAll', type: 'toggle', label: 'Replace All', default: true },
  ],
}
