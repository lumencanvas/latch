import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { resolveEffectSource, COLOR_CORRECT_FRAGMENT_THREE } from '../shared'

const definition: NodeDefinition = {
  id: 'color-correction',
  name: 'Color Correction',
  version: '1.0.0',
  category: 'visual',
  description: 'Adjust brightness, contrast, saturation, hue, and gamma',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'brightness', type: 'number', label: 'Brightness' },
    { id: 'contrast', type: 'number', label: 'Contrast' },
    { id: 'saturation', type: 'number', label: 'Saturation' },
    { id: 'hue', type: 'number', label: 'Hue' },
    { id: 'gamma', type: 'number', label: 'Gamma' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'brightness', type: 'slider', label: 'Brightness', default: 0, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'contrast', type: 'slider', label: 'Contrast', default: 1, props: { min: 0, max: 3, step: 0.01 } },
    { id: 'saturation', type: 'slider', label: 'Saturation', default: 1, props: { min: 0, max: 3, step: 0.01 } },
    { id: 'hue', type: 'slider', label: 'Hue', default: 0, props: { min: -180, max: 180, step: 1 } },
    { id: 'gamma', type: 'slider', label: 'Gamma', default: 1, props: { min: 0.1, max: 3, step: 0.01 } },
  ],
  tags: ['color correction', 'grade', 'grading', 'levels', 'lut', 'brightness', 'contrast', 'saturation', 'hue', 'gamma', 'adjust'],
  info: {
    overview: 'Adjusts brightness, contrast, saturation, hue, and gamma of an input texture. All parameters can be driven by external inputs, making it easy to animate color grading in real time.',
    tips: [
      'Drive the hue input with an LFO for a continuously shifting color palette effect.',
      'Set saturation to 0 to convert any texture to grayscale before further processing.',
      'Small gamma adjustments (0.8 to 1.2) can significantly improve perceived contrast without clipping highlights.',
    ],
    pairsWith: ['webcam', 'blend', 'shader', 'lfo', 'image-loader'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = resolveEffectSource(ctx.nodeId, getThreeShaderRenderer(), ctx.inputs.get('texture'))?.tex ?? null
  const brightness = (ctx.inputs.get('brightness') as number) ?? (ctx.controls.get('brightness') as number) ?? 0
  const contrast = (ctx.inputs.get('contrast') as number) ?? (ctx.controls.get('contrast') as number) ?? 1
  const saturation = (ctx.inputs.get('saturation') as number) ?? (ctx.controls.get('saturation') as number) ?? 1
  const hue = (ctx.inputs.get('hue') as number) ?? (ctx.controls.get('hue') as number) ?? 0
  const gamma = (ctx.inputs.get('gamma') as number) ?? (ctx.controls.get('gamma') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile color correction shader
  let shader = renderer.getEffectShader('_color_correct')
  if (!shader) {
    const result = renderer.compileEffectShader(COLOR_CORRECT_FRAGMENT_THREE, '_color_correct')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_texture.value = texture
  uniforms.u_brightness.value = brightness
  uniforms.u_contrast.value = contrast
  uniforms.u_saturation.value = saturation
  uniforms.u_hue.value = hue
  uniforms.u_gamma.value = gamma

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

export default defineNode({ definition, executor })
