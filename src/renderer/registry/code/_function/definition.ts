import type { NodeDefinition } from '../../types'

export const functionNode: NodeDefinition = {
  id: 'function',
  name: 'Function',
  version: '1.0.0',
  category: 'code',
  description: 'Custom JavaScript function with sandboxed execution',
  icon: 'code-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ],
  outputs: [
    { id: 'result', type: 'any', label: 'Result' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'code', type: 'code', label: 'Code', default: `// Access inputs via: inputs.a, inputs.b, etc.
// Access time via: time, deltaTime, frame
// Use state: getState('key', default), setState('key', value)
// Return a value or object with multiple outputs

return inputs.a + inputs.b;` },
  ],
}
