import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'clasp-video-send',
  name: 'CLASP Video Send',
  version: '1.0.0',
  category: 'clasp',
  description: 'Send video stream to a CLASP relay room',
  icon: 'cast',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'video', type: 'video', label: 'Video' },
    { id: 'room', type: 'string', label: 'Room' },
    { id: 'start', type: 'trigger', label: 'Start' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
  ],
  outputs: [
    { id: 'broadcasting', type: 'boolean', label: 'Broadcasting' },
    { id: 'fps', type: 'number', label: 'FPS' },
    { id: 'bitrate', type: 'number', label: 'Bitrate' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'room', type: 'text', label: 'Room', default: 'default', props: { placeholder: 'default' } },
    { id: 'streamAddress', type: 'text', label: 'Stream Address', default: '', props: { placeholder: 'Auto-generated from room + session', monospace: true } },
    { id: 'quality', type: 'select', label: 'Quality', default: 'medium', props: { options: [{ label: 'Low (480p)', value: 'low' }, { label: 'Medium (720p)', value: 'medium' }, { label: 'High (1080p)', value: 'high' }] } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    { id: 'autoStart', type: 'toggle', label: 'Auto Start', default: false },
  ],
  tags: ['clasp', 'video', 'send', 'stream', 'relay', 'broadcast'],
  info: {
    overview: 'Broadcasts a video or texture source to a CLASP relay room so other clients can receive it. Supports configurable quality presets from 480p to 1080p. You can feed in a texture or a video element as the source.',
    tips: [
      'Choose a lower quality preset on constrained networks to maintain a stable frame rate.',
      'Enable Auto Start to begin broadcasting as soon as the connection is established.',
      'Use the FPS and Bitrate outputs to monitor stream health in real time.',
      'The Stream Address field auto-fills when broadcasting starts. You can customize it to use a specific address.',
    ],
    pairsWith: ['clasp-connection', 'clasp-video-receive', 'monitor', 'console'],
  },
}

// executors/clasp.ts imports Pinia stores that transitively re-enter the nodeRegistry
// glob; a static import here would form a load-time cycle (undefined executor at glob
// time). Defer to first call via dynamic import — clasp executors are async, and the
// module is already loaded at startup through executors/index.ts, so this is a cached
// lookup, not an extra network/parse cost.
const executor = async (ctx: ExecutionContext) =>
  (await import('@/engine/executors/clasp')).claspVideoSendExecutor(ctx)

export default defineNode({ definition, executor })
