import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('pixelate')!

export const imageFxPixelateNode: NodeDefinition = {
  id: 'image-fx-pixelate',
  name: 'Pixelate FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Mosaic / pixelation effect by quantizing UV coordinates.',
  icon: 'grid-3x3',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'pixelate', 'mosaic', 'lo-fi', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Snaps the image to a coarse grid for a blocky, retro mosaic look. Pixels sets the grid resolution (lower = chunkier).',
    tips: [
      'Automate Pixels from an audio envelope to "resolve" the image on a beat.',
      'Stack with Posterize for a true 8-bit aesthetic.',
    ],
    pairsWith: ['webcam', 'image-fx-posterize', 'blend', 'main-output'],
  },
}
