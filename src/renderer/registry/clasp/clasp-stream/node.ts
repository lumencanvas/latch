import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'clasp-stream',
  name: 'CLASP Stream',
  version: '1.0.0',
  category: 'clasp',
  description: 'Stream high-rate data (continuous updates)',
  icon: 'activity',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'sent', type: 'boolean', label: 'Sent' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'address', type: 'text', label: 'Address', default: '/stream', props: { placeholder: '/sensor/temperature' } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
  ],
  tags: ['clasp', 'stream', 'continuous', 'high-rate'],
  info: {
    overview: 'Sends high-rate continuous data to a CLASP address. Unlike Set, stream messages are optimized for throughput and do not guarantee persistence. Use this for sensor feeds, animation data, or any value that updates many times per second.',
    tips: [
      'Disable the Enabled toggle to pause streaming without disconnecting.',
      'Use CLASP Set instead when the value needs to persist on the server.',
      'Keep the address consistent so subscribers can reliably receive the stream.',
    ],
    pairsWith: ['clasp-connection', 'clasp-subscribe', 'oscillator', 'expression'],
  },
}

// executors/clasp.ts imports Pinia stores that transitively re-enter the nodeRegistry
// glob; a static import here would form a load-time cycle (undefined executor at glob
// time). Defer to first call via dynamic import — clasp executors are async, and the
// module is already loaded at startup through executors/index.ts, so this is a cached
// lookup, not an extra network/parse cost.
const executor = async (ctx: ExecutionContext) =>
  (await import('@/engine/executors/clasp')).claspStreamExecutor(ctx)

export default defineNode({ definition, executor })
