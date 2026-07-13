import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { BLEND_FRAGMENT_THREE } from '../shared'

const definition: NodeDefinition = {
  id: 'blend',
  name: 'Blend',
  version: '1.0.0',
  category: 'visual',
  description: 'Blend two textures together',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'texture', label: 'A' },
    { id: 'b', type: 'texture', label: 'B' },
    { id: 'mix', type: 'number', label: 'Mix' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'mix', type: 'slider', label: 'Mix', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'mode', type: 'select', label: 'Mode', default: 'normal', props: { options: ['normal', 'add', 'multiply', 'screen', 'overlay'] } },
  ],
  tags: ['blend', 'mix', 'composite', 'layer', 'crossfade', 'merge', 'add', 'multiply', 'screen', 'overlay'],
  info: {
    overview: 'Combines two texture inputs into a single output using a selectable blend mode and a mix slider. Supports normal, add, multiply, screen, and overlay modes. This is the standard way to layer visuals together.',
    tips: [
      'Animate the mix value with an LFO to crossfade between two sources rhythmically.',
      'Add mode is useful for combining bright elements on dark backgrounds without washing out the image.',
      'Chain multiple blend nodes to composite more than two layers together.',
    ],
    pairsWith: ['shader', 'webcam', 'color-correction', 'lfo', 'image-loader'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture0 = ctx.inputs.get('a') as THREE.Texture | null
  const texture1 = ctx.inputs.get('b') as THREE.Texture | null
  const mixAmount = (ctx.inputs.get('mix') as number) ?? (ctx.controls.get('mix') as number) ?? 0.5
  const modeStr = (ctx.controls.get('mode') as string) ?? 'normal'

  const modeMap: Record<string, number> = {
    normal: 0,
    add: 1,
    multiply: 2,
    screen: 3,
    overlay: 4,
  }
  const mode = modeMap[modeStr] ?? 0

  const outputs = new Map<string, unknown>()

  if (!texture0 && !texture1) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile blend shader
  let shader = renderer.getEffectShader('_blend')
  if (!shader) {
    const result = renderer.compileEffectShader(BLEND_FRAGMENT_THREE, '_blend')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  // Update uniforms
  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_mix.value = mixAmount
  uniforms.u_mode.value = mode

  if (texture0) {
    uniforms.u_texture0.value = texture0
  }
  if (texture1) {
    uniforms.u_texture1.value = texture1
  }

  // Render to per-node render target
  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

export default defineNode({ definition, executor })
