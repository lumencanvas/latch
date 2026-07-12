import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'clasp-emit',
  name: 'CLASP Emit',
  version: '1.0.0',
  category: 'clasp',
  description: 'Emit a CLASP event (one-time trigger)',
  icon: 'zap',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'payload', type: 'any', label: 'Payload' },
    { id: 'trigger', type: 'trigger', label: 'Emit' },
  ],
  outputs: [
    { id: 'sent', type: 'boolean', label: 'Sent' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'address', type: 'text', label: 'Event Address', default: '/event', props: { placeholder: '/cue/fire' } },
  ],
  tags: ['clasp', 'emit', 'event', 'trigger'],
  info: {
    overview: 'Sends a one-shot CLASP event to a specified address. Events are fire-and-forget signals that do not persist state on the server. Use this for cues, triggers, and other momentary actions.',
    tips: [
      'Connect a trigger input to control exactly when the event fires.',
      'Use address patterns like /cue/fire to organize events by category.',
      'Attach a payload for events that need to carry data along with the trigger.',
    ],
    pairsWith: ['clasp-connection', 'clasp-subscribe', 'trigger', 'function'],
  },
}

// executors/clasp.ts imports Pinia stores that transitively re-enter the nodeRegistry
// glob; a static import here would form a load-time cycle (undefined executor at glob
// time). Defer to first call via dynamic import — clasp executors are async, and the
// module is already loaded at startup through executors/index.ts, so this is a cached
// lookup, not an extra network/parse cost.
const executor = async (ctx: ExecutionContext) =>
  (await import('@/engine/executors/clasp')).claspEmitExecutor(ctx)

export default defineNode({ definition, executor })
