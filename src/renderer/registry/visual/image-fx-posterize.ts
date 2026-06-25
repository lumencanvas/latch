import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('posterize')!

export const imageFxPosterizeNode: NodeDefinition = {
  id: 'image-fx-posterize',
  name: 'Posterize FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Quantize colors into a small number of discrete bands.',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'posterize', 'quantize', 'banding', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Reduces each color channel to a small number of levels for a flat, screen-printed / poster look. Lower Levels = stronger banding.',
    tips: [
      'Combine with Pixelate for a true lo-fi 8-bit aesthetic.',
      'Posterizing after a Blur gives clean cel-shaded regions.',
    ],
    pairsWith: ['webcam', 'image-fx-pixelate', 'blur', 'main-output'],
  },
}
