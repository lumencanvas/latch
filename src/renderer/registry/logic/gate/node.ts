import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { gateExecutor } from '@/engine/executors/logic'

const definition: NodeDefinition = {
  id: 'gate',
  name: 'Gate',
  version: '1.0.0',
  category: 'logic',
  description: 'Pass or block value',
  icon: 'door-open',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'open', type: 'toggle', label: 'Open', default: true },
    { id: 'value', type: 'text', label: 'Value', default: '' },
    { id: 'whenClosed', type: 'select', label: 'When Closed', default: 'hold', props: { options: ['hold', 'block'] } },
  ],
  info: {
    overview: 'Passes a value straight through while the gate is open. While closed it either holds the last value that passed (When Closed = hold, a freeze) or outputs nothing (block). The gate state is controlled by the boolean Gate input or the Open toggle. This is the simplest way to conditionally allow or stop data flow.',
    tips: [
      'Connect a compare or equals node to the Gate input for dynamic control.',
      'Use the toggle control to manually override the gate during testing.',
      'Set When Closed to block when gating triggers, so nothing is emitted while closed.',
    ],
    pairsWith: ['compare', 'and', 'or', 'pass-if', 'latch'],
  },
}

export default defineNode({ definition, executor: gateExecutor })
