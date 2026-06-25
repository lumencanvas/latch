import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('scanlines')!

export const imageFxScanlinesNode: NodeDefinition = {
  id: 'image-fx-scanlines',
  name: 'Scanlines FX',
  version: '1.0.0',
  category: 'visual',
  description: 'CRT-style horizontal scanlines with optional roll.',
  icon: 'tv',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'scanlines', 'crt', 'retro', 'effect', 'video', 'vj'],
  info: {
    overview:
      'Darkens alternating horizontal lines for a CRT / broadcast look. Lines sets the density, Intensity the contrast, and Scroll rolls the lines up or down.',
    tips: [
      'Pair with RGB Shift and Vignette for a full retro-TV chain.',
      'A small non-zero Scroll adds subtle life; large values look like a vertical-hold glitch.',
    ],
    pairsWith: ['webcam', 'image-fx-rgb-shift', 'shader', 'main-output'],
  },
}
