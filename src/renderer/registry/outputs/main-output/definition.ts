import type { NodeDefinition } from '../../types'

export const mainOutputNode: NodeDefinition = {
  id: 'main-output',
  name: 'Main Output',
  version: '1.0.0',
  category: 'outputs',
  description: 'Final output viewer with large preview',
  icon: 'monitor-play',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  outputs: [],
  controls: [],
  tags: ['main output', 'output', 'screen', 'projector', 'display', 'render', 'final', 'master', 'preview'],
  info: {
    overview: 'Displays the final texture output as a large preview. Use this as the terminal node in any visual pipeline to see what your flow produces. Every flow that generates visuals should end with one of these.',
    tips: [
      'Only one Main Output is needed per flow since additional instances will overwrite each other.',
      'Connect a blend node before this to layer multiple texture sources together.',
    ],
    pairsWith: ['shader', 'blend', 'webcam', 'texture-display', 'render-3d'],
  },
}
