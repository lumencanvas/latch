import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { defaultValueExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'default-value',
  name: 'Default',
  version: '1.0.0',
  category: 'logic',
  description: 'Return input value, or default if null/undefined/empty',
  icon: 'shield-check',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'default', type: 'text', label: 'Default', default: '' },
    { id: 'treatEmptyAsNull', type: 'toggle', label: 'Empty=Null', default: true },
  ],
  tags: ['fallback', 'default', 'null', 'coalesce'],
  info: {
    overview: 'Passes the input value through unchanged unless it is null, undefined, or optionally empty. When the value is missing, it outputs the configured default instead. Helpful for ensuring downstream nodes always receive usable data.',
    tips: [
      'Enable Empty=Null to treat empty strings the same as null.',
      'Use this after external data sources that may return incomplete values.',
    ],
    pairsWith: ['coalesce', 'is-null', 'is-empty', 'pass-if'],
  },
}

export default defineNode({ definition, executor: defaultValueExecutor })
