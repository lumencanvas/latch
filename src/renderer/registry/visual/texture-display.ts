import type { NodeDefinition } from '../types'

export const textureDisplayNode: NodeDefinition = {
  id: 'texture-display',
  name: 'Texture Display',
  version: '1.0.0',
  category: 'visual',
  description: 'Display texture on canvas',
  icon: 'monitor',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  outputs: [],
  controls: [],
  tags: ['texture display', 'preview', 'view', 'monitor', 'output', 'screen', 'display'],
  info: {
    overview: 'Renders an input texture directly onto a visible canvas in the node. This is the simplest way to preview any texture output without routing it to the main output. It has no controls and no outputs.',
    tips: [
      'Place one after each major processing step to visually debug your texture pipeline.',
      'This node does not pass the texture through, so branch the connection if you also need to continue the chain.',
      'Use it alongside the main-output node to compare intermediate results with the final render.',
    ],
    pairsWith: ['shader', 'blend', 'webcam', 'main-output', 'color-correction'],
  },
}
