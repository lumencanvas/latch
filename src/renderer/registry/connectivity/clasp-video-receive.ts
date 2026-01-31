import type { NodeDefinition } from '../types'

export const claspVideoReceiveNode: NodeDefinition = {
  id: 'clasp-video-receive',
  name: 'CLASP Video Receive',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Receive video stream from a CLASP relay room',
  icon: 'monitor',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'room', type: 'string', label: 'Room' },
    { id: 'peerId', type: 'string', label: 'Peer ID' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'fps', type: 'number', label: 'FPS' },
    { id: 'receiving', type: 'boolean', label: 'Receiving' },
    { id: 'peers', type: 'array', label: 'Peers' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'room', type: 'text', label: 'Room', default: 'default', props: { placeholder: 'default' } },
    { id: 'peerId', type: 'text', label: 'Peer ID', default: '', props: { placeholder: 'Auto-select first broadcaster' } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
  ],
  tags: ['clasp', 'video', 'receive', 'stream', 'relay'],
}
