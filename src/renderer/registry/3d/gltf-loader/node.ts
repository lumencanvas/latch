import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer } from '@/services/visual/ThreeRenderer'
import { nodeObjects, loadedGLTFs, loadedGLTFUrls, disposeGLTFGroup } from '../shared'

const definition: NodeDefinition = {
  id: 'gltf-loader',
  name: 'GLTF Loader',
  version: '1.0.0',
  category: '3d',
  description: 'Load 3D models in GLTF/GLB format',
  icon: 'file-box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'url', type: 'text', label: 'URL', default: '' },
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    { id: 'scale', type: 'number', label: 'Scale', default: 1, props: { min: 0.001, max: 100 } },
  ],
  tags: ['gltf', 'glb', 'model', 'mesh', 'import', '3d', 'load', 'asset'],
  info: {
    overview: 'Loads external 3D models in GLTF or GLB format from a URL and outputs them as scene objects. This is the primary way to bring complex, pre-built assets into the scene. The loading output lets you show progress feedback.',
    tips: [
      'Use the scale control to normalize models that were exported at different unit scales.',
      'Check the error output to catch missing or malformed URLs early.',
      'Host GLB files on a CORS-enabled server or use local file paths in Electron.',
    ],
    pairsWith: ['scene-3d', 'transform-3d', 'material-3d', 'group-3d'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''

  if (!url) {
    const outputs = new Map<string, unknown>()
    outputs.set('object', null)
    outputs.set('loading', false)
    outputs.set('error', 'No URL provided')
    return outputs
  }

  // Check if already loaded with same URL
  const existingGltf = loadedGLTFs.get(ctx.nodeId)
  const existingUrl = loadedGLTFUrls.get(ctx.nodeId)

  if (existingGltf && existingUrl === url) {
    // Same URL, reuse existing model
    const outputs = new Map<string, unknown>()
    outputs.set('object', existingGltf)
    outputs.set('loading', false)
    outputs.set('error', null)
    return outputs
  }

  // URL changed - dispose old GLTF before loading new one
  if (existingGltf) {
    disposeGLTFGroup(existingGltf)
    loadedGLTFs.delete(ctx.nodeId)
    loadedGLTFUrls.delete(ctx.nodeId)
    nodeObjects.delete(ctx.nodeId)
  }

  // Load GLTF
  const renderer = getThreeRenderer()

  try {
    const group = await renderer.loadGLTF(url)

    // Apply transforms
    const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
    const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 0
    const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0
    const scale = (ctx.controls.get('scale') as number) ?? 1

    group.position.set(posX, posY, posZ)
    group.scale.setScalar(scale)

    loadedGLTFs.set(ctx.nodeId, group)
    loadedGLTFUrls.set(ctx.nodeId, url)
    nodeObjects.set(ctx.nodeId, group)

    const outputs = new Map<string, unknown>()
    outputs.set('object', group)
    outputs.set('loading', false)
    outputs.set('error', null)
    return outputs
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load GLTF'

    const outputs = new Map<string, unknown>()
    outputs.set('object', null)
    outputs.set('loading', false)
    outputs.set('error', errorMessage)
    return outputs
  }
}

export default defineNode({ definition, executor })
