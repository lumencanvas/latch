/**
 * 3D Node Executors
 *
 * These executors handle Three.js-based 3D nodes
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'

// Store for managing 3D objects per node
const nodeObjects = new Map<string, THREE.Object3D>()
const nodeMaterials = new Map<string, THREE.Material>()
const nodeSceneRefs = new Map<string, { objects: THREE.Object3D[]; lights: THREE.Light[] }>()
const loadedGLTFs = new Map<string, THREE.Group>()

// Cache for converted textures (video textures need to be reused)
const videoTextures = new Map<string, THREE.VideoTexture>()
const dataTextures = new Map<string, THREE.Texture>()

/**
 * Convert a pipeline texture (WebGLTexture or HTMLVideoElement) to THREE.Texture
 * Returns undefined if the input is not a valid texture source
 */
function convertToThreeTexture(
  input: unknown,
  cacheKey: string
): THREE.Texture | undefined {
  if (!input) return undefined

  // If it's already a THREE.Texture, return it
  if (input instanceof THREE.Texture) {
    return input
  }

  // If it's an HTMLVideoElement, create/reuse VideoTexture
  if (input instanceof HTMLVideoElement) {
    let videoTex = videoTextures.get(cacheKey)
    if (!videoTex) {
      videoTex = new THREE.VideoTexture(input)
      videoTex.minFilter = THREE.LinearFilter
      videoTex.magFilter = THREE.LinearFilter
      videoTex.format = THREE.RGBAFormat
      videoTex.colorSpace = THREE.SRGBColorSpace
      videoTextures.set(cacheKey, videoTex)
    } else {
      // Update the video reference if needed
      if (videoTex.image !== input) {
        videoTex.image = input
        videoTex.needsUpdate = true
      }
    }
    return videoTex
  }

  // If it's a WebGLTexture, convert via DataTexture
  // Note: This requires reading pixels which is slow - use sparingly
  if (input instanceof WebGLTexture) {
    const renderer = getThreeRenderer()
    // Use default size - in a real implementation we'd want to track the actual size
    const texture = renderer.createTextureFromWebGL(input, 512, 512)

    // Cache the data texture
    const existing = dataTextures.get(cacheKey)
    if (existing) {
      existing.dispose()
    }
    dataTextures.set(cacheKey, texture)

    return texture
  }

  // If it's a canvas element, create CanvasTexture
  if (input instanceof HTMLCanvasElement) {
    const canvasTex = new THREE.CanvasTexture(input)
    canvasTex.needsUpdate = true
    return canvasTex
  }

  return undefined
}

/**
 * Dispose 3D resources for a node
 */
export function dispose3DNode(nodeId: string): void {
  const obj = nodeObjects.get(nodeId)
  if (obj) {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose())
      } else if (obj.material) {
        obj.material.dispose()
      }
    }
    nodeObjects.delete(nodeId)
  }

  const mat = nodeMaterials.get(nodeId)
  if (mat) {
    mat.dispose()
    nodeMaterials.delete(nodeId)
  }

  nodeSceneRefs.delete(nodeId)

  const gltf = loadedGLTFs.get(nodeId)
  if (gltf) {
    loadedGLTFs.delete(nodeId)
  }

  // Dispose cached textures for this node
  for (const [key, tex] of videoTextures) {
    if (key.startsWith(nodeId)) {
      tex.dispose()
      videoTextures.delete(key)
    }
  }
  for (const [key, tex] of dataTextures) {
    if (key.startsWith(nodeId)) {
      tex.dispose()
      dataTextures.delete(key)
    }
  }

  // Also dispose from ThreeRenderer
  const renderer = getThreeRenderer()
  renderer.disposeNode(nodeId)
}

/**
 * Dispose all 3D resources
 */
export function disposeAll3DNodes(): void {
  for (const [nodeId] of nodeObjects) {
    dispose3DNode(nodeId)
  }
  nodeObjects.clear()
  nodeMaterials.clear()
  nodeSceneRefs.clear()
  loadedGLTFs.clear()

  // Clear texture caches
  for (const tex of videoTextures.values()) {
    tex.dispose()
  }
  videoTextures.clear()

  for (const tex of dataTextures.values()) {
    tex.dispose()
  }
  dataTextures.clear()
}

// ============================================================================
// Scene Node
// ============================================================================

export const scene3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()
  const sceneData = renderer.getOrCreateScene(ctx.nodeId)

  // Get objects input (can be array or single object)
  const objectsInput = ctx.inputs.get('objects')
  const backgroundColorHex = (ctx.controls.get('backgroundColor') as string) ?? '#000000'
  const showGrid = (ctx.controls.get('showGrid') as boolean) ?? false

  // Parse background color
  const backgroundColor = new THREE.Color(backgroundColorHex)
  sceneData.scene.background = backgroundColor

  // Clear previous scene objects
  renderer.clearScene(ctx.nodeId)

  // Track what we're adding this frame
  const sceneRef = { objects: [] as THREE.Object3D[], lights: [] as THREE.Light[] }

  // Add grid helper if enabled
  if (showGrid) {
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    sceneData.scene.add(gridHelper)
  }

  // Add ambient light as default if no lights added
  let hasLight = false

  // Process objects input
  if (objectsInput) {
    const objects = Array.isArray(objectsInput) ? objectsInput : [objectsInput]

    for (const obj of objects) {
      if (obj instanceof THREE.Object3D) {
        sceneData.scene.add(obj)
        sceneRef.objects.push(obj)

        if (obj instanceof THREE.Light) {
          hasLight = true
          sceneRef.lights.push(obj)
        }
      }
    }
  }

  // Add default lighting if no lights present
  if (!hasLight) {
    // Ambient light for overall illumination
    const defaultAmbient = new THREE.AmbientLight(0xffffff, 0.6)
    sceneData.scene.add(defaultAmbient)

    // Directional light for shape/depth
    const defaultDirectional = new THREE.DirectionalLight(0xffffff, 0.8)
    defaultDirectional.position.set(5, 10, 7)
    sceneData.scene.add(defaultDirectional)
  }

  nodeSceneRefs.set(ctx.nodeId, sceneRef)

  const outputs = new Map<string, unknown>()
  outputs.set('scene', sceneData.scene)
  return outputs
}

// ============================================================================
// Camera Node
// ============================================================================

export const camera3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()

  const cameraType = (ctx.controls.get('type') as 'perspective' | 'orthographic') ?? 'perspective'
  const fov = (ctx.controls.get('fov') as number) ?? 50
  const near = (ctx.controls.get('near') as number) ?? 0.1
  const far = (ctx.controls.get('far') as number) ?? 1000
  const orthoSize = (ctx.controls.get('orthoSize') as number) ?? 5

  // Get position from inputs or controls
  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 2
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 5

  // Get target from inputs or controls
  const targetX = (ctx.inputs.get('targetX') as number) ?? (ctx.controls.get('targetX') as number) ?? 0
  const targetY = (ctx.inputs.get('targetY') as number) ?? (ctx.controls.get('targetY') as number) ?? 0
  const targetZ = (ctx.inputs.get('targetZ') as number) ?? (ctx.controls.get('targetZ') as number) ?? 0

  const camera = renderer.getOrCreateCamera(ctx.nodeId, cameraType, {
    fov,
    near,
    far,
    orthoSize,
    position: [posX, posY, posZ],
    target: [targetX, targetY, targetZ],
  })

  const outputs = new Map<string, unknown>()
  outputs.set('camera', camera)
  return outputs
}

// ============================================================================
// Render 3D Node
// ============================================================================

export const render3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const scene = ctx.inputs.get('scene') as THREE.Scene | undefined
  const camera = ctx.inputs.get('camera') as THREE.Camera | undefined

  if (!scene || !camera) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('depth', null)
    return outputs
  }

  const renderer = getThreeRenderer()
  const width = (ctx.controls.get('width') as number) ?? 512
  const height = (ctx.controls.get('height') as number) ?? 512
  const includeDepth = (ctx.controls.get('includeDepth') as boolean) ?? false

  // Render to default framebuffer (canvas) so we can share it
  renderer.renderToCanvas(scene, camera, width, height)

  // Return the canvas element - this can be used by visual nodes
  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getCanvas())
  outputs.set('depth', null) // Depth not supported in canvas mode
  return outputs
}

// ============================================================================
// Box 3D Node
// ============================================================================

export const box3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const width = (ctx.inputs.get('width') as number) ?? (ctx.controls.get('width') as number) ?? 1
  const height = (ctx.inputs.get('height') as number) ?? (ctx.controls.get('height') as number) ?? 1
  const depth = (ctx.inputs.get('depth') as number) ?? (ctx.controls.get('depth') as number) ?? 1
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  // Create or update mesh
  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createBox(width, height, depth, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    // Update geometry if dimensions changed
    mesh.geometry.dispose()
    mesh.geometry = new THREE.BoxGeometry(width, height, depth)

    // Update material if provided
    if (material) {
      mesh.material = material
    }
  }

  // Apply transforms from inputs
  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

// ============================================================================
// Sphere 3D Node
// ============================================================================

export const sphere3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 0.5
  const widthSegments = (ctx.controls.get('widthSegments') as number) ?? 32
  const heightSegments = (ctx.controls.get('heightSegments') as number) ?? 16
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createSphere(radius, widthSegments, heightSegments, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments)

    if (material) {
      mesh.material = material
    }
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

// ============================================================================
// Plane 3D Node
// ============================================================================

export const plane3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const width = (ctx.inputs.get('width') as number) ?? (ctx.controls.get('width') as number) ?? 1
  const height = (ctx.inputs.get('height') as number) ?? (ctx.controls.get('height') as number) ?? 1
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({
      color: parseInt(colorHex.replace('#', ''), 16),
      side: 'double',
    })
    mesh = renderer.createPlane(width, height, 1, 1, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.PlaneGeometry(width, height)

    if (material) {
      mesh.material = material
    }
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

// ============================================================================
// Cylinder 3D Node
// ============================================================================

export const cylinder3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const radiusTop = (ctx.inputs.get('radiusTop') as number) ?? (ctx.controls.get('radiusTop') as number) ?? 0.5
  const radiusBottom = (ctx.inputs.get('radiusBottom') as number) ?? (ctx.controls.get('radiusBottom') as number) ?? 0.5
  const height = (ctx.inputs.get('height') as number) ?? (ctx.controls.get('height') as number) ?? 1
  const radialSegments = (ctx.controls.get('radialSegments') as number) ?? 32
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createCylinder(radiusTop, radiusBottom, height, radialSegments, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)

    if (material) {
      mesh.material = material
    }
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

// ============================================================================
// Torus 3D Node
// ============================================================================

export const torus3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 0.5
  const tube = (ctx.inputs.get('tube') as number) ?? (ctx.controls.get('tube') as number) ?? 0.2
  const radialSegments = (ctx.controls.get('radialSegments') as number) ?? 16
  const tubularSegments = (ctx.controls.get('tubularSegments') as number) ?? 100
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createTorus(radius, tube, radialSegments, tubularSegments, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)

    if (material) {
      mesh.material = material
    }
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

// ============================================================================
// Transform 3D Node
// ============================================================================

export const transform3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const object = ctx.inputs.get('object') as THREE.Object3D | undefined

  if (!object) {
    const outputs = new Map<string, unknown>()
    outputs.set('object', null)
    outputs.set('transform', null)
    return outputs
  }

  // Get transform values
  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  const rotX = (ctx.inputs.get('rotX') as number) ?? (ctx.controls.get('rotX') as number) ?? 0
  const rotY = (ctx.inputs.get('rotY') as number) ?? (ctx.controls.get('rotY') as number) ?? 0
  const rotZ = (ctx.inputs.get('rotZ') as number) ?? (ctx.controls.get('rotZ') as number) ?? 0

  const scaleX = (ctx.inputs.get('scaleX') as number) ?? (ctx.controls.get('scaleX') as number) ?? 1
  const scaleY = (ctx.inputs.get('scaleY') as number) ?? (ctx.controls.get('scaleY') as number) ?? 1
  const scaleZ = (ctx.inputs.get('scaleZ') as number) ?? (ctx.controls.get('scaleZ') as number) ?? 1

  // Apply transforms
  const renderer = getThreeRenderer()
  renderer.applyTransform(
    object,
    [posX, posY, posZ],
    [rotX, rotY, rotZ],
    [scaleX, scaleY, scaleZ]
  )

  // Create transform data
  const transformData = {
    position: { x: posX, y: posY, z: posZ },
    rotation: { x: rotX, y: rotY, z: rotZ },
    scale: { x: scaleX, y: scaleY, z: scaleZ },
  }

  const outputs = new Map<string, unknown>()
  outputs.set('object', object)
  outputs.set('transform', transformData)
  return outputs
}

// ============================================================================
// Material 3D Node
// ============================================================================

export const material3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
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

// ============================================================================
// Group 3D Node
// ============================================================================

export const group3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()

  let group = nodeObjects.get(ctx.nodeId) as THREE.Group | undefined

  if (!group) {
    group = renderer.createGroup()
    nodeObjects.set(ctx.nodeId, group)
  }

  // Clear previous children
  while (group.children.length > 0) {
    group.remove(group.children[0])
  }

  // Get objects input (array or single)
  const objectsInput = ctx.inputs.get('objects')

  if (objectsInput) {
    const objects = Array.isArray(objectsInput) ? objectsInput : [objectsInput]

    for (const obj of objects) {
      if (obj instanceof THREE.Object3D) {
        group.add(obj.clone())
      }
    }
  }

  // Apply group transform
  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  group.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', group)
  return outputs
}

// ============================================================================
// Ambient Light Node
// ============================================================================

export const ambientLight3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const colorHex = (ctx.controls.get('color') as string) ?? '#ffffff'
  const intensity = (ctx.inputs.get('intensity') as number) ?? (ctx.controls.get('intensity') as number) ?? 0.5

  const color = parseInt(colorHex.replace('#', ''), 16)

  const renderer = getThreeRenderer()
  const light = renderer.createAmbientLight(color, intensity)

  // Store reference
  nodeObjects.set(ctx.nodeId, light)

  const outputs = new Map<string, unknown>()
  outputs.set('light', light)
  outputs.set('object', light)
  return outputs
}

// ============================================================================
// Directional Light Node
// ============================================================================

export const directionalLight3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const colorHex = (ctx.controls.get('color') as string) ?? '#ffffff'
  const intensity = (ctx.inputs.get('intensity') as number) ?? (ctx.controls.get('intensity') as number) ?? 1
  const castShadow = (ctx.controls.get('castShadow') as boolean) ?? true

  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 5
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 5
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 5

  const color = parseInt(colorHex.replace('#', ''), 16)

  const renderer = getThreeRenderer()
  const light = renderer.createDirectionalLight(color, intensity, [posX, posY, posZ], castShadow)

  nodeObjects.set(ctx.nodeId, light)

  const outputs = new Map<string, unknown>()
  outputs.set('light', light)
  outputs.set('object', light)
  return outputs
}

// ============================================================================
// Point Light Node
// ============================================================================

export const pointLight3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const colorHex = (ctx.controls.get('color') as string) ?? '#ffffff'
  const intensity = (ctx.inputs.get('intensity') as number) ?? (ctx.controls.get('intensity') as number) ?? 1
  const distance = (ctx.controls.get('distance') as number) ?? 0
  const decay = (ctx.controls.get('decay') as number) ?? 2
  const castShadow = (ctx.controls.get('castShadow') as boolean) ?? false

  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 2
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  const color = parseInt(colorHex.replace('#', ''), 16)

  const renderer = getThreeRenderer()
  const light = renderer.createPointLight(color, intensity, distance, decay, [posX, posY, posZ], castShadow)

  nodeObjects.set(ctx.nodeId, light)

  const outputs = new Map<string, unknown>()
  outputs.set('light', light)
  outputs.set('object', light)
  return outputs
}

// ============================================================================
// Spot Light Node
// ============================================================================

export const spotLight3DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const colorHex = (ctx.controls.get('color') as string) ?? '#ffffff'
  const intensity = (ctx.inputs.get('intensity') as number) ?? (ctx.controls.get('intensity') as number) ?? 1
  const distance = (ctx.controls.get('distance') as number) ?? 0
  const angle = (ctx.controls.get('angle') as number) ?? 30 // degrees
  const penumbra = (ctx.controls.get('penumbra') as number) ?? 0.1
  const decay = (ctx.controls.get('decay') as number) ?? 2
  const castShadow = (ctx.controls.get('castShadow') as boolean) ?? true

  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 5
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  const targetX = (ctx.controls.get('targetX') as number) ?? 0
  const targetY = (ctx.controls.get('targetY') as number) ?? 0
  const targetZ = (ctx.controls.get('targetZ') as number) ?? 0

  const color = parseInt(colorHex.replace('#', ''), 16)
  const angleRad = THREE.MathUtils.degToRad(angle)

  const renderer = getThreeRenderer()
  const light = renderer.createSpotLight(
    color,
    intensity,
    distance,
    angleRad,
    penumbra,
    decay,
    [posX, posY, posZ],
    [targetX, targetY, targetZ],
    castShadow
  )

  nodeObjects.set(ctx.nodeId, light)

  const outputs = new Map<string, unknown>()
  outputs.set('light', light)
  outputs.set('object', light)
  return outputs
}

// ============================================================================
// GLTF Loader Node
// ============================================================================

export const gltfLoader3DExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''

  if (!url) {
    const outputs = new Map<string, unknown>()
    outputs.set('object', null)
    outputs.set('loading', false)
    outputs.set('error', 'No URL provided')
    return outputs
  }

  // Check if already loaded
  const existingGltf = loadedGLTFs.get(ctx.nodeId)
  if (existingGltf) {
    const outputs = new Map<string, unknown>()
    outputs.set('object', existingGltf)
    outputs.set('loading', false)
    outputs.set('error', null)
    return outputs
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

// ============================================================================
// Registry
// ============================================================================

export const threeExecutors: Record<string, NodeExecutorFn> = {
  // Core
  'scene-3d': scene3DExecutor,
  'camera-3d': camera3DExecutor,
  'render-3d': render3DExecutor,

  // Primitives
  'box-3d': box3DExecutor,
  'sphere-3d': sphere3DExecutor,
  'plane-3d': plane3DExecutor,
  'cylinder-3d': cylinder3DExecutor,
  'torus-3d': torus3DExecutor,

  // Transform & Material
  'transform-3d': transform3DExecutor,
  'material-3d': material3DExecutor,
  'group-3d': group3DExecutor,

  // Lights
  'ambient-light-3d': ambientLight3DExecutor,
  'directional-light-3d': directionalLight3DExecutor,
  'point-light-3d': pointLight3DExecutor,
  'spot-light-3d': spotLight3DExecutor,

  // Advanced
  'gltf-loader': gltfLoader3DExecutor,
}
