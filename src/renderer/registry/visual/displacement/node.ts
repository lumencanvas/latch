import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { resolveEffectSource, DISPLACEMENT_FRAGMENT_THREE } from '../shared'

const definition: NodeDefinition = {
  id: 'displacement',
  name: 'Displacement',
  version: '1.0.0',
  category: 'visual',
  description: 'Displace texture using displacement map',
  icon: 'move',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'displacement', type: 'texture', label: 'Displacement Map' },
    { id: 'strength', type: 'number', label: 'Strength' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'strength', type: 'slider', label: 'Strength', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'channel', type: 'select', label: 'Channel', default: 'rg', props: { options: ['r', 'rg', 'rgb'] } },
  ],
  tags: ['displacement', 'displace', 'warp', 'distortion', 'glitch', 'liquify', 'map', 'effect'],
  info: {
    overview: 'Warps the input texture by using a second texture as a displacement map. The brightness values of the displacement map shift pixel positions in the source. Strength controls how far pixels are moved, and channel selects which map channels drive the displacement axes.',
    tips: [
      'Feed a noise shader into the displacement map input for organic, fluid-like distortion.',
      'Animate the strength value with an LFO to pulse the distortion in and out.',
      'The rg channel mode gives independent horizontal and vertical displacement; use r for horizontal only.',
    ],
    pairsWith: ['shader', 'blur', 'webcam', 'lfo', 'blend'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = resolveEffectSource(ctx.nodeId, getThreeShaderRenderer(), ctx.inputs.get('texture'))?.tex ?? null
  const displacementMap = ctx.inputs.get('displacement') as THREE.Texture | null
  const strength = (ctx.inputs.get('strength') as number) ?? (ctx.controls.get('strength') as number) ?? 0.1

  const channelStr = (ctx.controls.get('channel') as string) ?? 'rg'
  const channelMap: Record<string, number> = { r: 0, g: 1, b: 2, rg: 3 }
  const channel = channelMap[channelStr] ?? 3

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  // If no displacement map, pass through
  if (!displacementMap) {
    outputs.set('texture', texture)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile displacement shader
  let shader = renderer.getEffectShader('_displacement')
  if (!shader) {
    const result = renderer.compileEffectShader(DISPLACEMENT_FRAGMENT_THREE, '_displacement')
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
  uniforms.u_displacement.value = displacementMap
  uniforms.u_strength.value = strength
  uniforms.u_channel.value = channel

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

export default defineNode({ definition, executor })
