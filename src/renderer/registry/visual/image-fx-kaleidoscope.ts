import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('kaleidoscope')!

export const imageFxKaleidoscopeNode: NodeDefinition = {
  id: 'image-fx-kaleidoscope',
  name: 'Kaleidoscope FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Mirror-segment kaleidoscope symmetry.',
  icon: 'aperture',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'kaleidoscope', 'mirror', 'symmetry', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Reflects the source into radial mirror segments for a kaleidoscope effect. Segments sets how many mirror wedges; Rotation spins the pattern.',
    tips: [
      'Connect a Time node to Rotation for a continuously turning kaleidoscope.',
      'Feed a moving source (webcam, shader) for the most striking results.',
    ],
    pairsWith: ['webcam', 'shader', 'blend', 'main-output'],
  },
}
