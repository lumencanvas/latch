import type { NodeDefinition } from '../types'
import { getPresetById, generateControlsFromUniforms } from '@/services/visual/ShaderPresets'

const preset = getPresetById('glitch')!

export const imageFxGlitchNode: NodeDefinition = {
  id: 'image-fx-glitch',
  name: 'Glitch FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Digital glitch / datamosh effect — block displacement and RGB tearing.',
  icon: 'zap',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: generateControlsFromUniforms(preset.uniforms),
  tags: ['fx', 'glitch', 'datamosh', 'effect', 'video', 'vj', 'distortion'],
  info: {
    overview:
      'Applies a GPU glitch effect to the source texture: random block offsets, scanline jumps, and RGB split that re-roll over time. Runs every frame on the GPU.',
    tips: [
      'Drive Intensity from an audio or LFO node for beat-reactive glitching.',
      'Keep Speed low for sparse, punctuated glitches; raise it for constant chaos.',
    ],
    pairsWith: ['webcam', 'shader', 'blend', 'main-output'],
  },
}
