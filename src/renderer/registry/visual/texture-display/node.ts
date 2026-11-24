import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { defineNodeState } from '@/engine/nodeState'

const definition: NodeDefinition = {
  id: 'texture-display',
  name: 'Texture Display',
  version: '1.0.0',
  category: 'visual',
  description: 'Display texture on canvas',
  icon: 'monitor',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  outputs: [],
  controls: [],
  tags: ['texture display', 'preview', 'view', 'monitor', 'output', 'screen', 'display'],
  info: {
    overview: 'Renders an input texture directly onto a visible canvas in the node. This is the simplest way to preview any texture output without routing it to the main output. It has no controls and no outputs.',
    tips: [
      'Place one after each major processing step to visually debug your texture pipeline.',
      'This node does not pass the texture through, so branch the connection if you also need to continue the chain.',
      'Use it alongside the main-output node to compare intermediate results with the final render.',
    ],
    pairsWith: ['shader', 'blend', 'webcam', 'main-output', 'color-correction'],
  },
}

/** Per-node display canvas + last refresh time; freed on delete / Stop. */
const displayState = defineNodeState<{ canvas: HTMLCanvasElement; at: number }>({
  label: 'texture-display',
  dispose: (st) => {
    st.canvas.width = 0
    st.canvas.height = 0
  },
})

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('_display', null)
    return outputs
  }

  // A raw canvas (e.g. Render 3D's output) displays as-is
  const raw = texture as unknown
  if (raw instanceof HTMLCanvasElement) {
    outputs.set('_display', raw)
    return outputs
  }
  if (!(raw instanceof THREE.Texture)) {
    outputs.set('_display', null)
    return outputs
  }

  // Render into a per-node 2D canvas. This used to target the renderer's own internal WebGL
  // canvas: renderToCanvas needs a 2D context, which a WebGL canvas can't give, so it bailed and
  // `_display` showed whatever the shared canvas last held (another node's frame, or nothing).
  const st = displayState.getOrCreate(ctx.nodeId, () => ({ canvas: document.createElement('canvas'), at: -Infinity }))
  const now = performance.now()
  // Preview only: cap the (GPU-readback) refresh like the on-screen previews do.
  if (now - st.at >= 1000 / 30) {
    st.at = now
    const img = texture.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | null
    const w = img?.videoWidth || img?.width || 512
    const h = img?.videoHeight || img?.height || 512
    if (st.canvas.width !== w) st.canvas.width = w
    if (st.canvas.height !== h) st.canvas.height = h
    getThreeShaderRenderer().renderToCanvas(texture, st.canvas)
  }

  outputs.set('_display', st.canvas)
  return outputs
}

export default defineNode({ definition, executor })
