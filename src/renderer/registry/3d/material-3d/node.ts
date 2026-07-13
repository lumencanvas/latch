import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer } from '@/services/visual/ThreeRenderer'
import { nodeMaterials, convertToThreeTexture } from '../shared'

const definition: NodeDefinition = {
  id: 'material-3d',
  name: 'Material 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a PBR material',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'colorMap', type: 'texture', label: 'Color Map' },
    { id: 'normalMap', type: 'texture', label: 'Normal Map' },
    { id: 'roughnessMap', type: 'texture', label: 'Roughness Map' },
    { id: 'metalnessMap', type: 'texture', label: 'Metalness Map' },
    { id: 'metalness', type: 'number', label: 'Metalness' },
    { id: 'roughness', type: 'number', label: 'Roughness' },
    { id: 'opacity', type: 'number', label: 'Opacity' },
  ],
  outputs: [
    { id: 'material', type: 'material3d', label: 'Material' },
  ],
  controls: [
    { id: 'type', type: 'select', label: 'Type', default: 'standard', props: { options: ['standard', 'basic', 'phong', 'physical'] } },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
    { id: 'metalness', type: 'slider', label: 'Metalness', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'roughness', type: 'slider', label: 'Roughness', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'opacity', type: 'slider', label: 'Opacity', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'wireframe', type: 'toggle', label: 'Wireframe', default: false },
    { id: 'side', type: 'select', label: 'Side', default: 'front', props: { options: ['front', 'back', 'double'] } },
    { id: 'emissive', type: 'color', label: 'Emissive', default: '#000000' },
    { id: 'emissiveIntensity', type: 'number', label: 'Emissive Int.', default: 0, props: { min: 0, max: 10 } },
  ],
  tags: ['material', 'pbr', 'shader', 'surface', 'texture', '3d', 'metal', 'roughness'],
  info: {
    overview: 'Creates a PBR (physically based rendering) material that controls how surfaces look under lighting. Supports metalness, roughness, opacity, emissive glow, wireframe mode, and texture map inputs for detailed surfaces.',
    tips: [
      'Set metalness to 1 and roughness near 0 for a mirror-like chrome finish.',
      'Use the physical type for the most accurate PBR response to lighting.',
      'Connect texture maps to the color, normal, or roughness inputs for realistic detail without extra geometry.',
    ],
    pairsWith: ['box-3d', 'sphere-3d', 'cylinder-3d', 'torus-3d', 'gltf-loader'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()

  const materialType = (ctx.controls.get('type') as 'standard' | 'basic' | 'phong' | 'physical') ?? 'standard'
  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'
  const metalness = (ctx.inputs.get('metalness') as number) ?? (ctx.controls.get('metalness') as number) ?? 0
  const roughness = (ctx.inputs.get('roughness') as number) ?? (ctx.controls.get('roughness') as number) ?? 0.5
  const opacity = (ctx.inputs.get('opacity') as number) ?? (ctx.controls.get('opacity') as number) ?? 1
  const wireframe = (ctx.controls.get('wireframe') as boolean) ?? false
  const side = (ctx.controls.get('side') as 'front' | 'back' | 'double') ?? 'front'
  const emissiveHex = (ctx.controls.get('emissive') as string) ?? '#000000'
  const emissiveIntensity = (ctx.controls.get('emissiveIntensity') as number) ?? 0

  // Get texture inputs - convert from pipeline textures (WebGLTexture, HTMLVideoElement) to THREE.Texture
  const colorMapInput = ctx.inputs.get('colorMap')
  const normalMapInput = ctx.inputs.get('normalMap')
  const roughnessMapInput = ctx.inputs.get('roughnessMap')
  const metalnessMapInput = ctx.inputs.get('metalnessMap')

  // Convert pipeline textures to Three.js textures
  // Cache keys include nodeId to ensure proper disposal
  const colorMap = convertToThreeTexture(colorMapInput, `${ctx.nodeId}_colorMap`)
  const normalMap = convertToThreeTexture(normalMapInput, `${ctx.nodeId}_normalMap`)
  const roughnessMap = convertToThreeTexture(roughnessMapInput, `${ctx.nodeId}_roughnessMap`)
  const metalnessMap = convertToThreeTexture(metalnessMapInput, `${ctx.nodeId}_metalnessMap`)

  const color = parseInt(colorHex.replace('#', ''), 16)
  const emissive = parseInt(emissiveHex.replace('#', ''), 16)

  const material = renderer.createMaterial({
    type: materialType,
    color,
    metalness,
    roughness,
    opacity,
    transparent: opacity < 1,
    wireframe,
    side,
    emissive,
    emissiveIntensity,
    map: colorMap,
    normalMap,
    roughnessMap,
    metalnessMap,
  })

  // Dispose old material
  const oldMat = nodeMaterials.get(ctx.nodeId)
  if (oldMat) {
    oldMat.dispose()
  }
  nodeMaterials.set(ctx.nodeId, material)

  const outputs = new Map<string, unknown>()
  outputs.set('material', material)
  return outputs
}

export default defineNode({ definition, executor })
