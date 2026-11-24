import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
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

type MaterialParams = {
  color: number
  metalness: number
  roughness: number
  opacity: number
  wireframe: boolean
  side: 'front' | 'back' | 'double'
  emissive: number
  emissiveIntensity: number
  map?: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  metalnessMap?: THREE.Texture
}

/**
 * Apply params to an existing material, mirroring which fields createMaterial sets per type.
 * Only flags `needsUpdate` (a program rebuild) for changes that alter the shader defines:
 * transparency, side, or a map slot going empty↔filled.
 */
function updateMaterialInPlace(material: THREE.Material, p: MaterialParams): void {
  const m = material as THREE.Material & Record<string, unknown>
  const has = (k: string) => k in m && m[k] !== undefined

  ;(m.color as THREE.Color | undefined)?.setHex(p.color)
  if (has('metalness')) m.metalness = p.metalness
  if (has('roughness')) m.roughness = p.roughness
  if (material instanceof THREE.MeshStandardMaterial) {
    material.emissive.setHex(p.emissive)
    material.emissiveIntensity = p.emissiveIntensity
  }
  material.opacity = p.opacity
  const transparent = p.opacity < 1
  if (material.transparent !== transparent) {
    material.transparent = transparent
    material.needsUpdate = true
  }
  if (has('wireframe')) m.wireframe = p.wireframe
  const side = p.side === 'back' ? THREE.BackSide : p.side === 'double' ? THREE.DoubleSide : THREE.FrontSide
  if (material.side !== side) {
    material.side = side
    material.needsUpdate = true
  }

  const setMap = (key: string, tex: THREE.Texture | undefined) => {
    if (!(key in m)) return // this material type has no such slot
    const next = tex ?? null
    const prev = (m[key] as THREE.Texture | null | undefined) ?? null
    if (prev === next) return
    m[key] = next
    if (!prev !== !next) material.needsUpdate = true // USE_MAP-style define toggled
  }
  setMap('map', p.map)
  if (!(material instanceof THREE.MeshBasicMaterial)) setMap('normalMap', p.normalMap)
  if (material instanceof THREE.MeshStandardMaterial) {
    setMap('roughnessMap', p.roughnessMap)
    setMap('metalnessMap', p.metalnessMap)
  }
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
  // Cache keys include nodeId, and nodeId is passed so the cached textures are tracked for disposal
  const colorMap = convertToThreeTexture(colorMapInput, `${ctx.nodeId}_colorMap`, ctx.nodeId)
  const normalMap = convertToThreeTexture(normalMapInput, `${ctx.nodeId}_normalMap`, ctx.nodeId)
  const roughnessMap = convertToThreeTexture(roughnessMapInput, `${ctx.nodeId}_roughnessMap`, ctx.nodeId)
  const metalnessMap = convertToThreeTexture(metalnessMapInput, `${ctx.nodeId}_metalnessMap`, ctx.nodeId)

  const color = parseInt(colorHex.replace('#', ''), 16)
  const emissive = parseInt(emissiveHex.replace('#', ''), 16)

  // Create the material once per type and update it in place. Building a new material every
  // frame (and disposing the previous) released its shader program, so three recompiled the
  // program each frame — a hitch per frame per material node.
  let material = nodeMaterials.get(ctx.nodeId)
  if (!material || material.userData.materialType !== materialType) {
    material?.dispose()
    material = renderer.createMaterial({
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
    material.userData.materialType = materialType
    nodeMaterials.set(ctx.nodeId, material)
  } else {
    updateMaterialInPlace(material, {
      color, metalness, roughness, opacity, wireframe, side, emissive, emissiveIntensity,
      map: colorMap, normalMap, roughnessMap, metalnessMap,
    })
  }

  const outputs = new Map<string, unknown>()
  outputs.set('material', material)
  return outputs
}

export default defineNode({ definition, executor })
