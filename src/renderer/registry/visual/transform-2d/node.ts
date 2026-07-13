import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { resolveEffectSource, TRANSFORM_FRAGMENT_THREE } from '../shared'

const definition: NodeDefinition = {
  id: 'transform-2d',
  name: 'Transform 2D',
  version: '1.0.0',
  category: 'visual',
  description: 'Apply 2D transforms (scale, rotate, translate)',
  icon: 'move-3d',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'scaleX', type: 'number', label: 'Scale X' },
    { id: 'scaleY', type: 'number', label: 'Scale Y' },
    { id: 'rotate', type: 'number', label: 'Rotation' },
    { id: 'translateX', type: 'number', label: 'Translate X' },
    { id: 'translateY', type: 'number', label: 'Translate Y' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'scaleX', type: 'slider', label: 'Scale X', default: 1, props: { min: 0.1, max: 5, step: 0.01 } },
    { id: 'scaleY', type: 'slider', label: 'Scale Y', default: 1, props: { min: 0.1, max: 5, step: 0.01 } },
    { id: 'rotate', type: 'slider', label: 'Rotation', default: 0, props: { min: -180, max: 180, step: 1 } },
    { id: 'translateX', type: 'slider', label: 'Translate X', default: 0, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'translateY', type: 'slider', label: 'Translate Y', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
  tags: ['transform', 'transform 2d', 'scale', 'rotate', 'translate', 'move', 'position', 'pan', 'zoom', 'flip'],
  info: {
    overview: 'Applies scale, rotation, and translation transforms to a texture. All parameters accept external inputs so they can be animated. This is the standard way to reposition or resize a texture layer before blending or display.',
    tips: [
      'Drive the rotation input with an LFO for a continuously spinning texture effect.',
      'Scale values below 1.0 shrink the texture, revealing the border; combine with blend to composite over a background.',
      'Translation values are normalized, so 0.5 moves the texture halfway across the frame.',
    ],
    pairsWith: ['blend', 'shader', 'lfo', 'webcam', 'displacement'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = resolveEffectSource(ctx.nodeId, getThreeShaderRenderer(), ctx.inputs.get('texture'))?.tex ?? null
  const translateX = (ctx.inputs.get('translateX') as number) ?? (ctx.controls.get('translateX') as number) ?? 0
  const translateY = (ctx.inputs.get('translateY') as number) ?? (ctx.controls.get('translateY') as number) ?? 0
  const rotate = (ctx.inputs.get('rotate') as number) ?? (ctx.controls.get('rotate') as number) ?? 0
  const scaleX = (ctx.inputs.get('scaleX') as number) ?? (ctx.controls.get('scaleX') as number) ?? 1
  const scaleY = (ctx.inputs.get('scaleY') as number) ?? (ctx.controls.get('scaleY') as number) ?? 1
  const pivotX = (ctx.controls.get('pivotX') as number) ?? 0.5
  const pivotY = (ctx.controls.get('pivotY') as number) ?? 0.5

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile transform shader
  let shader = renderer.getEffectShader('_transform2d')
  if (!shader) {
    const result = renderer.compileEffectShader(TRANSFORM_FRAGMENT_THREE, '_transform2d')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  // Convert rotation from degrees to radians
  const rotateRad = (rotate * Math.PI) / 180

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_texture.value = texture
  uniforms.u_translate.value.set(translateX, translateY)
  uniforms.u_rotate.value = rotateRad
  uniforms.u_scale.value.set(scaleX, scaleY)
  uniforms.u_pivot.value.set(pivotX, pivotY)

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

export default defineNode({ definition, executor })
