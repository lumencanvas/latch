import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { getPresetById, generateControlsFromUniforms, generateModulationInputs } from '@/services/visual/ShaderPresets'
import { makeImageFxExecutor } from '../shared'

const preset = getPresetById('dither')!

const definition: NodeDefinition = {
  id: 'image-fx-dither',
  name: 'Dither FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Ordered (Bayer) dithering with color quantization.',
  icon: 'grip',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }, ...generateModulationInputs(preset.uniforms)],
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

const executor = makeImageFxExecutor('dither')

export default defineNode({ definition, executor })
