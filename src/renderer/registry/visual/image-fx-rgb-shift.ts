import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('chromatic-aberration')!

export const imageFxRgbShiftNode: NodeDefinition = {
  id: 'image-fx-rgb-shift',
  name: 'RGB Shift FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Chromatic aberration — separates the red/green/blue channels.',
  icon: 'shuffle',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'rgb shift', 'chromatic aberration', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Offsets the red and blue channels in opposite directions for a chromatic-aberration / VHS look. Amount sets the separation distance; Angle sets the direction.',
    tips: [
      'A small Amount (0.005–0.02) reads as a subtle lens fringe; large values look broken/glitchy.',
      'Animate Angle with a Time node for a swirling color split.',
    ],
    pairsWith: ['webcam', 'image-fx-glitch', 'blend', 'main-output'],
  },
}
