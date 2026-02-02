import type { NodeDefinition } from '../types'

export const claspVideoSendNode: NodeDefinition = {
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
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'room', type: 'text', label: 'Room', default: 'default', props: { placeholder: 'default' } },
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
    ],
    pairsWith: ['clasp-connection', 'clasp-video-receive', 'monitor', 'console'],
  },
}
