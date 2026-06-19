import type { NodeDefinition } from '../types'

export const material3dNode: NodeDefinition = {
  id: 'material-3d',
  name: 'Material 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a PBR material',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'colorMap', type: 'texture', label: 'Color Map' },
    { id: 'normalMap', type: 'texture', label: 'Normal Map' },
    { id: 'roughnessMap', type: 'texture', label: 'Roughness Map' },
    { id: 'metalnessMap', type: 'texture', label: 'Metalness Map' },
    { id: 'metalness', type: 'number', label: 'Metalness' },
    { id: 'roughness', type: 'number', label: 'Roughness' },
    { id: 'opacity', type: 'number', label: 'Opacity' },
  ],
  outputs: [
    { id: 'material', type: 'material3d', label: 'Material' },
  ],
  controls: [
    { id: 'type', type: 'select', label: 'Type', default: 'standard', props: { options: ['standard', 'basic', 'phong', 'physical'] } },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    { id: 'metalness', type: 'slider', label: 'Metalness', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'roughness', type: 'slider', label: 'Roughness', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'opacity', type: 'slider', label: 'Opacity', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'wireframe', type: 'toggle', label: 'Wireframe', default: false },
    { id: 'side', type: 'select', label: 'Side', default: 'front', props: { options: ['front', 'back', 'double'] } },
    { id: 'emissive', type: 'color', label: 'Emissive', default: '#000000' },
    { id: 'emissiveIntensity', type: 'number', label: 'Emissive Int.', default: 0, props: { min: 0, max: 10 } },
  ],
  tags: ['material', 'pbr', 'shader', 'surface', 'texture', '3d', 'metal', 'roughness'],
  info: {
    overview: 'Creates a PBR (physically based rendering) material that controls how surfaces look under lighting. Supports metalness, roughness, opacity, emissive glow, wireframe mode, and texture map inputs for detailed surfaces.',
    tips: [
      'Set metalness to 1 and roughness near 0 for a mirror-like chrome finish.',
      'Use the physical type for the most accurate PBR response to lighting.',
      'Connect texture maps to the color, normal, or roughness inputs for realistic detail without extra geometry.',
    ],
    pairsWith: ['box-3d', 'sphere-3d', 'cylinder-3d', 'torus-3d', 'gltf-loader'],
  },
}
