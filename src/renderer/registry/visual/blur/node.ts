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
  const source = resolveEffectSource(ctx.nodeId, getThreeShaderRenderer(), ctx.inputs.get('texture'))
  const texture = source?.tex ?? null
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 1
  // `passes` repeats the separable H+V blur (was declared but never read). Clamped to the
  // control's 1..10 range so a wild value can't stall the frame.
  const rawPasses = Number(ctx.controls.get('passes') ?? 2)
  const passes = Math.max(1, Math.min(10, Math.round(Number.isFinite(rawPasses) ? rawPasses : 2)))

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

  // Texel size must match the render size, which follows the input's resolution (render()
  // sizes its target from u_texture) — a fixed 512 made the radius scale with the source size.
  const width = source?.w ?? 512
  const height = source?.h ?? 512

  uniforms.u_resolution.value.set(width, height)
  uniforms.u_radius.value = radius

  // Ping-pong between two targets: H pass reads `src` → `${id}_h`, V pass reads `_h` → `id`.
  // Pass N+1's H reads pass N's `id` output while writing `_h`, so no target is ever both
  // sampled and written in the same draw.
  let src: unknown = texture
  let resultTexture: unknown = null
  for (let p = 0; p < passes; p++) {
    uniforms.u_texture.value = src
    uniforms.u_direction.value = 0
    const horizontalTexture = renderer.render(shader, [], `${ctx.nodeId}_h`)
    if (!horizontalTexture) {
      resultTexture = null
      break
    }
    uniforms.u_texture.value = horizontalTexture
    uniforms.u_direction.value = 1
    resultTexture = renderer.render(shader, [], ctx.nodeId)
    src = resultTexture
  }
  outputs.set('texture', resultTexture)

  return outputs
}

export default defineNode({ definition, executor })
