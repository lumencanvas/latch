import type { NodeDefinition } from '../types'

export const claspVideoReceiveNode: NodeDefinition = {
  id: 'clasp-video-receive',
  name: 'CLASP Video Receive',
  version: '1.0.0',
  category: 'clasp',
  description: 'Receive video stream from a CLASP relay room or direct address',
  icon: 'monitor',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'room', type: 'string', label: 'Room' },
    { id: 'peerId', type: 'string', label: 'Peer ID' },
    { id: 'address', type: 'string', label: 'Address' },
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
    { id: 'videoMode', type: 'select', label: 'Mode', default: 'room', props: { options: [{ label: 'Room', value: 'room' }, { label: 'Direct Address', value: 'direct' }] } },
    { id: 'room', type: 'text', label: 'Room', default: 'default', visibleWhen: { controlId: 'videoMode', value: 'room' }, props: { placeholder: 'default' } },
    { id: 'peerId', type: 'text', label: 'Peer ID', default: '', visibleWhen: { controlId: 'videoMode', value: 'room' }, props: { placeholder: 'Auto-select first broadcaster' } },
    { id: 'address', type: 'text', label: 'Address', default: '', visibleWhen: { controlId: 'videoMode', value: 'direct' }, props: { placeholder: '/video/relay/myroom/stream/abc123' } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
  ],
  tags: ['clasp', 'video', 'receive', 'stream', 'relay'],
  info: {
    overview: 'Receives a video stream from a CLASP relay room or direct address and outputs it as a texture. In Room mode, the node discovers peers and connects to the first broadcaster unless a specific Peer ID is set. In Direct Address mode, it subscribes directly to any CLASP stream address.',
    tips: [
      'Leave Peer ID blank to auto-select the first available broadcaster.',
      'Use Direct Address mode to subscribe to any CLASP stream address without room discovery.',
      'Use the Peers output to list all participants in the room.',
      'Disable the Enabled toggle to stop receiving without leaving the room.',
    ],
    pairsWith: ['clasp-connection', 'clasp-video-send', 'monitor', 'console'],
  },
}
