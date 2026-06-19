import type { NodeDefinition } from '../types'

export const scene3dNode: NodeDefinition = {
  id: 'scene-3d',
  name: 'Scene 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Container for 3D objects',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
  ],
  outputs: [
    { id: 'scene', type: 'scene3d', label: 'Scene' },
  ],
  controls: [
    { id: 'backgroundColor', type: 'color', label: 'Background', default: '#000000' },
    { id: 'showGrid', type: 'toggle', label: 'Show Grid', default: false },
  ],
  tags: ['scene', '3d', 'world', 'stage', 'container', 'root'],
  info: {
    overview: 'Acts as the root container that holds all 3D objects, lights, and groups. Every 3D pipeline starts here. Connect objects to the input and pass the scene output to Render 3D along with a camera.',
    tips: [
      'Enable Show Grid during development to help with object placement and scale reference.',
      'Set the background color to match your intended environment before adding lights.',
      'Connect multiple objects to the objects input; the node accepts several connections.',
    ],
    pairsWith: ['render-3d', 'camera-3d', 'ambient-light-3d', 'directional-light-3d'],
  },
}
