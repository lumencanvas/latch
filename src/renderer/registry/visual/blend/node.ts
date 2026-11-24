import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { BLEND_FRAGMENT_THREE, resolveEffectSource } from '../shared'

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
  // Resolve like the other effect nodes: canvas sources cached per slot, video via canvas
  // (a raw video texture samples black; a raw <canvas> wasn't a sampler at all).
  const renderer = getThreeShaderRenderer()
  const srcA = ctx.inputs.get('a') ? resolveEffectSource(ctx.nodeId, renderer, ctx.inputs.get('a')) : null
  const srcB = ctx.inputs.get('b') ? resolveEffectSource(`${ctx.nodeId}::b`, renderer, ctx.inputs.get('b')) : null
  const texture0 = srcA?.tex ?? null
  const texture1 = srcB?.tex ?? null
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

  // One input only: pass it through. The `_blend` shader (and its uniforms) is SHARED by every
  // Blend node, so an unset sampler kept whatever texture the previous Blend node bound —
  // another node's image bled into this one.
  if (!texture0 || !texture1) {
    outputs.set('texture', texture0 ?? texture1)
    return outputs
  }

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

  uniforms.u_texture0.value = texture0
  uniforms.u_texture1.value = texture1

  // Render to per-node render target at A's resolution (the shader has no u_texture, so the
  // renderer would otherwise fall back to a square 512² target and squash the aspect)
  const resultTexture = renderer.render(shader, [], ctx.nodeId, srcA?.w, srcA?.h)
  outputs.set('texture', resultTexture)
  return outputs
}

export default defineNode({ definition, executor })
