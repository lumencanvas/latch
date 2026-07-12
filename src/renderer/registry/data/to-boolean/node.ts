import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'to-boolean',
  name: 'To Boolean',
  version: '1.0.0',
  category: 'data',
  description: 'Convert value to boolean (truthy/falsy)',
  icon: 'toggle-right',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'truthy',
      props: { options: ['truthy', 'strict'] },
    },
  ],
  tags: ['convert', 'boolean', 'truthy', 'cast'],
  info: {
    overview: 'Converts any value to a boolean. In truthy mode, standard JavaScript truthiness rules apply. In strict mode, only the values true and "true" produce true. Useful for normalizing toggle states from various data sources.',
    tips: [
      'Use strict mode when parsing string-based boolean values from JSON or query parameters.',
      'Connect the output to a Gate node to open or close data flow based on the converted value.',
    ],
    pairsWith: ['gate', 'compare', 'to-number', 'select'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const mode = (ctx.controls.get('mode') as string) ?? 'truthy'

  let result: boolean

  if (mode === 'strict') {
    // Only accept true/false/"true"/"false"/1/0
    if (value === true || value === 'true' || value === 1) {
      result = true
    } else if (value === false || value === 'false' || value === 0) {
      result = false
    } else {
      result = false
    }
  } else {
    // Truthy conversion
    result = Boolean(value)
  }

  return new Map<string, unknown>([['result', result ? 1 : 0]])
}

export default defineNode({ definition, executor })
