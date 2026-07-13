import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { canvasTextureCache } from '../../visual/shared'

import { markRaw } from 'vue'
import MainOutputNode from './MainOutputNode.vue'

const definition: NodeDefinition = {
  id: 'main-output',
  component: markRaw(MainOutputNode),
  name: 'Main Output',
  version: '1.0.0',
  category: 'outputs',
  description: 'Final output viewer with large preview',
  icon: 'monitor-play',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  outputs: [],
  controls: [],
  tags: ['main output', 'output', 'screen', 'projector', 'display', 'render', 'final', 'master', 'preview'],
  info: {
    overview: 'Displays the final texture output as a large preview. Use this as the terminal node in any visual pipeline to see what your flow produces. Every flow that generates visuals should end with one of these.',
    tips: [
      'Only one Main Output is needed per flow since additional instances will overwrite each other.',
      'Connect a blend node before this to layer multiple texture sources together.',
    ],
    pairsWith: ['shader', 'blend', 'webcam', 'texture-display', 'render-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const textureInput = ctx.inputs.get('texture') as THREE.Texture | HTMLCanvasElement | null

  const outputs = new Map<string, unknown>()

  if (!textureInput) {
    outputs.set('_input_texture', null)
    return outputs
  }

  // Handle different input types
  let outputTexture: THREE.Texture

  if (textureInput instanceof THREE.Texture) {
    // Three.js texture - pass through directly for PixiJS display
    outputTexture = textureInput
  } else if (textureInput instanceof HTMLCanvasElement) {
    // Canvas element - convert to Three.js texture
    const renderer = getThreeShaderRenderer()
    const cacheKey = `canvas_${ctx.nodeId}`
    let cachedTexture = canvasTextureCache.get(cacheKey)

    if (!cachedTexture) {
      cachedTexture = renderer.createTexture(textureInput)
      canvasTextureCache.set(cacheKey, cachedTexture)
    } else {
      // Update the existing texture with new canvas content
      renderer.updateTexture(cachedTexture, textureInput)
    }
    outputTexture = cachedTexture
  } else {
    // Unknown type - return null
    outputs.set('_input_texture', null)
    return outputs
  }

  // Store the texture - PixiJS display component will render it directly
  // No more CPU-GPU roundtrip via renderToCanvas()
  outputs.set('_input_texture', outputTexture)
  return outputs
}

export default defineNode({ definition, executor })
