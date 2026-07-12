import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { consoleExecutor } from '@/engine/executors/debug'

const definition: NodeDefinition = {
  id: 'console',
  name: 'Console',
  version: '1.0.0',
  category: 'debug',
  description: 'Log value to console',
  icon: 'terminal',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [],
  controls: [
    { id: 'label', type: 'text', label: 'Label', default: 'Log' },
    { id: 'logOnChange', type: 'toggle', label: 'On Change', default: true },
  ],
  info: {
    overview: 'Prints the incoming value to the browser developer console. Useful for quick debugging when you need to inspect raw data flowing through a connection. Set a label to distinguish logs from different Console nodes.',
    tips: [
      'Disable "On Change" to stop continuous logging of high-frequency signals like audio or LFOs.',
      'Open the browser DevTools console to see the output since it does not display inside the node itself.',
    ],
    pairsWith: ['monitor', 'json-parse', 'json-stringify', 'type-of'],
  },
}

export default defineNode({ definition, executor: consoleExecutor })
