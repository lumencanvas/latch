import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { sampleHoldExecutor } from '@/engine/executors/utility'

// Co-located with its WINNING executor (dual-id resolution, Phase 6): the id lives in
// exactly one node.ts pairing the surviving definition with the matching executor, so the
// historical dedup crossing hazard is structurally gone. The rival implementation was deleted.
const definition: NodeDefinition = {
  id: 'sample-hold',
  name: 'Sample & Hold',
  version: '1.0.0',
  category: 'logic',
  description: 'Sample value when triggered, hold until next trigger',
  icon: 'pin',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [],
  tags: ['sample', 'hold', 'latch', 'capture'],
  info: {
    overview: 'Captures the current input value when triggered and holds that value until the next trigger arrives. Between triggers, the output stays constant regardless of input changes. Useful for snapshotting a value at a specific moment.',
    tips: [
      'Connect a periodic trigger to sample at regular intervals.',
      'Use with changed to capture values only when something else in the flow updates.',
    ],
    pairsWith: ['trigger', 'latch', 'changed', 'time'],
  },
}

export default defineNode({ definition, executor: sampleHoldExecutor })
