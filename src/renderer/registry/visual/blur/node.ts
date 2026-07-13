import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { resolveEffectSource, BLUR_FRAGMENT_THREE } from '../shared'

const definition: NodeDefinition = {
  id: 'blur',
  name: 'Blur',
  version: '1.0.0',
  category: 'visual',
  description: 'Apply Gaussian blur to texture',
  icon: 'droplet',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'radius', type: 'number', label: 'Radius' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'radius', type: 'slider', label: 'Radius', default: 5, props: { min: 0, max: 50, step: 0.5 } },
    { id: 'passes', type: 'number', label: 'Passes', default: 2, props: { min: 1, max: 10 } },
  ],
  tags: ['blur', 'gaussian', 'bloom', 'glow', 'soften', 'defocus', 'depth of field', 'effect'],
  info: {
    overview: 'Applies a Gaussian blur to the input texture. The radius controls how far the blur spreads, and the passes control determines quality. More passes produce a smoother result at the cost of performance.',
    tips: [
      'Keep passes at 2 or 3 for a good balance between quality and speed; going above 5 rarely looks different.',
      'Animate the radius with an LFO for a pulsing depth-of-field effect.',
      'Use a small blur radius as a noise reduction step before feeding into edge detection or color correction.',
    ],
    pairsWith: ['shader', 'blend', 'color-correction', 'lfo', 'displacement'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = resolveEffectSource(ctx.nodeId, getThreeShaderRenderer(), ctx.inputs.get('texture'))?.tex ?? null
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile blur shader
  let shader = renderer.getEffectShader('_blur')
  if (!shader) {
    const result = renderer.compileEffectShader(BLUR_FRAGMENT_THREE, '_blur')
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

  const width = 512
  const height = 512

  // Horizontal pass
  uniforms.u_texture.value = texture
  uniforms.u_resolution.value.set(width, height)
  uniforms.u_radius.value = radius
  uniforms.u_direction.value = 0

  const horizontalTexture = renderer.render(shader, [], `${ctx.nodeId}_h`)

  // Vertical pass
  if (horizontalTexture) {
    uniforms.u_texture.value = horizontalTexture
    uniforms.u_direction.value = 1

    const resultTexture = renderer.render(shader, [], ctx.nodeId)
    outputs.set('texture', resultTexture)
  } else {
    outputs.set('texture', null)
  }

  return outputs
}

export default defineNode({ definition, executor })
