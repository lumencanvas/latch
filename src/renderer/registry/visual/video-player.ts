import type { NodeDefinition } from '../types'

export const videoPlayerNode: NodeDefinition = {
  id: 'video-player',
  name: 'Video Player',
  version: '1.0.0',
  category: 'visual',
  description: 'Play video from URL or file',
  icon: 'play-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'play', type: 'trigger', label: 'Play' },
    { id: 'pause', type: 'trigger', label: 'Pause' },
    { id: 'seek', type: 'number', label: 'Seek (s)' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'video', type: 'video', label: 'Video Element' },
    { id: 'playing', type: 'boolean', label: 'Playing' },
    { id: 'time', type: 'number', label: 'Current Time' },
    { id: 'duration', type: 'number', label: 'Duration' },
    { id: 'progress', type: 'number', label: 'Progress (0-1)' },
  ],
  controls: [
    { id: 'url', type: 'text', label: 'Video URL', default: '' },
    { id: 'autoplay', type: 'toggle', label: 'Autoplay', default: false },
    { id: 'loop', type: 'toggle', label: 'Loop', default: true },
    {
      id: 'playbackRate',
      type: 'number',
      label: 'Playback Rate',
      default: 1,
      props: { min: 0.25, max: 4, step: 0.25 },
    },
    {
      id: 'volume',
      type: 'slider',
      label: 'Volume',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.01 },
    },
  ],
}
