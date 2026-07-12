import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { getPresetById, generateModulationInputs } from '@/services/visual/ShaderPresets'
import { imageFxChromaKeyExecutor } from '@/engine/executors/visual'

/**
 * Chroma-key controls are written explicitly (rather than auto-generated from the
 * preset uniforms) so the key color uses a proper hex color picker default; the
 * executor converts the hex string to the `u_key_color` vec3 at runtime. The numeric
 * keying params (Similarity/Smoothness/Spill) also expose modulation input ports
 * (matching the rest of the image-fx family); the vec3 key colour stays control-only.
 */
const preset = getPresetById('chroma-key')!

const definition: NodeDefinition = {
  id: 'image-fx-chroma-key',
  name: 'Chroma Key FX',
  version: '1.0.0',
  category: 'visual',
  description: 'Green-screen keying — makes a key color transparent for compositing.',
  icon: 'eraser',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }, ...generateModulationInputs(preset.uniforms)],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'u_key_color', type: 'color', label: 'Key Color', default: '#00ff00' },
    { id: 'u_similarity', type: 'slider', label: 'Similarity', default: 0.4, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'u_smoothness', type: 'slider', label: 'Smoothness', default: 0.1, props: { min: 0, max: 0.5, step: 0.01 } },
    { id: 'u_spill', type: 'slider', label: 'Spill Removal', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['fx', 'chroma key', 'green screen', 'keying', 'matte', 'composite', 'video', 'vj'],
  info: {
    overview:
      'Removes a key color (green by default) by making matching pixels transparent, so the source can be composited over another layer with a Blend node. Similarity widens the keyed range, Smoothness softens the matte edge, and Spill Removal kills colored fringing.',
    tips: [
      'Set Key Color by sampling your actual backdrop, then raise Similarity until it clears.',
      'Feed the keyed output and a background into a Blend node to composite.',
    ],
    pairsWith: ['webcam', 'blend', 'video-player', 'main-output'],
  },
}

export default defineNode({ definition, executor: imageFxChromaKeyExecutor })
