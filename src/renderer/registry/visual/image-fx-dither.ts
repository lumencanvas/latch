import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('dither')!

export const imageFxDitherNode: NodeDefinition = {
  id: 'image-fx-dither',
  name: 'Dither FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Ordered (Bayer) dithering with color quantization.',
  icon: 'grip',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'dither', 'bayer', 'retro', 'lo-fi', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Applies a 4×4 ordered (Bayer) dither pattern while quantizing colors, for a classic 1-bit / GameBoy / newsprint look. Levels sets the palette depth; Pixel Scale enlarges the dither cells.',
    tips: [
      'Levels = 2 gives a stark 1-bit look; raise it for more tonal range.',
      'Increase Pixel Scale for a chunkier, more visible dither grid.',
    ],
    pairsWith: ['webcam', 'image-fx-posterize', 'cv-grayscale', 'main-output'],
  },
}
