import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { getPresetById, generateControlsFromUniforms, generateModulationInputs } from '@/services/visual/ShaderPresets'
import { makeImageFxExecutor } from '../shared'

const preset = getPresetById('posterize')!

const definition: NodeDefinition = {
  id: 'image-fx-posterize',
  name: 'Posterize FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Quantize colors into a small number of discrete bands.',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }, ...generateModulationInputs(preset.uniforms)],
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

const executor = makeImageFxExecutor('posterize')

export default defineNode({ definition, executor })
