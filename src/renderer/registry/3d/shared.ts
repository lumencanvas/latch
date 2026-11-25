/**
 * 3D shared state & lifecycle (Workstream B co-location).
 *
 * The per-node Three.js state Maps, the texture/GLTF helpers, and the gc/dispose
 * lifecycle for the `3d` category live here so each node's executor can co-locate in
 * its own `registry/3d/<id>/node.ts` while still sharing this state. Moved verbatim
 * from `engine/executors/3d.ts` (now deleted). Store-free — a leaf, so importing it
 * from a co-located node.ts never closes the eager-glob cycle.
 */

import { defineLifecycle } from '@/engine/nodeState'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { getThreeRenderer, peekThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

// Store for managing 3D objects per node
export const nodeObjects = new Map<string, THREE.Object3D>()
export const nodeMaterials = new Map<string, THREE.Material>()
export const nodeSceneRefs = new Map<string, { objects: THREE.Object3D[]; lights: THREE.Light[] }>()
export const loadedGLTFs = new Map<string, THREE.Group>()
export const loadedGLTFUrls = new Map<string, string>() // Track URL for each loaded GLTF

// Cache for converted textures (video textures need to be reused)
const videoTextures = new Map<string, THREE.VideoTexture>()
const dataTextures = new Map<string, THREE.Texture>()
const canvasTextures = new Map<string, THREE.CanvasTexture>()

// Readback canvases for render-target textures coming from the shader context (per slot)
const rtReadbackCanvases = new Map<string, HTMLCanvasElement>()

// Track which texture keys belong to which node for O(1) disposal lookup
const nodeTextureKeys = new Map<string, Set<string>>()

// Track group state for efficient updates (avoid cloning every frame)
export const groupState = new Map<string, {
  inputIds: string[] // UUIDs of input objects
  clones: THREE.Object3D[] // References to our clones
}>()

// ============================================================================
// Primitive meshes (box / sphere / cylinder / plane / torus)
// ============================================================================

/** The node-owned fallback material of a primitive — the ONLY material a primitive disposes. */
export const primitiveDefaultMaterials = new Map<string, THREE.Material>()
/** Param signature of each primitive's current geometry (rebuild only when it changes). */
export const primitiveGeoKeys = new Map<string, string>()

/**
 * Shared per-frame update for the primitive mesh nodes. Previously each rebuilt its
 * BufferGeometry EVERY frame (dispose + new geometry + GPU re-upload ~60×/s) and never
 * applied a changed Color control after creation. Now: geometry is rebuilt only when
 * `geoKey` (its params) changes; the wired `material` input is used when present, else the
 * node's own default material (whose color tracks the control). A wired material belongs to
 * the Material 3D node and is never disposed here.
 */
export function updatePrimitiveMesh(
  ctx: ExecutionContext,
  geoKey: string,
  makeGeometry: () => THREE.BufferGeometry,
  opts: { side?: 'front' | 'double' } = {}
): THREE.Mesh {
  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'
  const materialInput = ctx.inputs.get('material')

  let defaultMat = primitiveDefaultMaterials.get(ctx.nodeId)
  if (!defaultMat) {
    defaultMat = getThreeRenderer().createMaterial({
      color: parseInt(colorHex.replace('#', ''), 16),
      side: opts.side,
    })
    defaultMat.userData.colorHex = colorHex
    primitiveDefaultMaterials.set(ctx.nodeId, defaultMat)
  } else if (defaultMat.userData.colorHex !== colorHex) {
    const c = (defaultMat as THREE.MeshStandardMaterial).color
    if (c) c.set(colorHex)
    defaultMat.userData.colorHex = colorHex
  }
  const material = materialInput instanceof THREE.Material ? materialInput : defaultMat

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined
  if (!(mesh instanceof THREE.Mesh)) {
    mesh = new THREE.Mesh(makeGeometry(), material)
    // Lights already cast shadows; primitives now take part (a floor plane catches them).
    mesh.castShadow = true
    mesh.receiveShadow = true
    nodeObjects.set(ctx.nodeId, mesh)
    primitiveGeoKeys.set(ctx.nodeId, geoKey)
  } else {
    if (primitiveGeoKeys.get(ctx.nodeId) !== geoKey) {
      mesh.geometry.dispose()
      mesh.geometry = makeGeometry()
      primitiveGeoKeys.set(ctx.nodeId, geoKey)
    }
    // Swap back to the default material when the input is unwired (it used to keep the
    // last wired material forever).
    if (mesh.material !== material) mesh.material = material
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)
  return mesh
}

// ============================================================================
// Lights
// ============================================================================

/**
 * Get this node's cached light, creating it once. Light nodes used to construct a NEW light
 * every frame; each shadow-casting one allocated a fresh shadow-map render target on its first
 * render that was never disposed (a GPU leak of 1024² per frame).
 */
export function getOrCreateLight<T extends THREE.Light>(
  nodeId: string,
  ctor: abstract new (...args: never[]) => T,
  create: () => T
): T {
  const existing = nodeObjects.get(nodeId)
  if (existing instanceof ctor) return existing
  if (existing instanceof THREE.Light) existing.dispose()
  const light = create()
  nodeObjects.set(nodeId, light)
  return light
}

/** Apply the common light params in place (only touching what changed). */
export function updateLight(light: THREE.Light, colorHex: string, intensity: number): void {
  if (light.userData.colorHex !== colorHex) {
    light.color.set(colorHex)
    light.userData.colorHex = colorHex
  }
  light.intensity = intensity
}

// ============================================================================
// Scene
// ============================================================================

/** Per scene-3d node: its own helpers (grid + fallback lights) and the upstream objects it holds. */
export interface SceneNodeState {
  grid: THREE.GridHelper | null
  ambient: THREE.AmbientLight
  directional: THREE.DirectionalLight
  current: Set<THREE.Object3D>
}
export const sceneNodeState = new Map<string, SceneNodeState>()

function disposeSceneNodeState(nodeId: string): void {
  const st = sceneNodeState.get(nodeId)
  if (!st) return
  for (const obj of st.current) obj.parent?.remove(obj)
  if (st.grid) {
    st.grid.parent?.remove(st.grid)
    st.grid.geometry.dispose()
    ;(st.grid.material as THREE.Material).dispose()
  }
  st.ambient.parent?.remove(st.ambient)
  st.directional.parent?.remove(st.directional)
  st.ambient.dispose()
  st.directional.dispose()
  sceneNodeState.delete(nodeId)
}

// ============================================================================
// GLTF loads in flight
// ============================================================================

/** The GLTF load each node has requested (identity doubles as a cancellation token). */
export const gltfLoadState = new Map<string, { url: string; error: string | null }>()

/**
 * Helper to track texture key for a node
 */
function trackTextureKey(nodeId: string, cacheKey: string): void {
  let keys = nodeTextureKeys.get(nodeId)
  if (!keys) {
    keys = new Set()
    nodeTextureKeys.set(nodeId, keys)
  }
  keys.add(cacheKey)
}

/**
 * Convert a pipeline texture (WebGLTexture or HTMLVideoElement) to THREE.Texture
 * Returns undefined if the input is not a valid texture source
 * @param width - Width of the texture (used for WebGLTexture conversion, defaults to 512)
 * @param height - Height of the texture (used for WebGLTexture conversion, defaults to 512)
 */
export function convertToThreeTexture(
  input: unknown,
  cacheKey: string,
  nodeId?: string,
  width = 512,
  height = 512
): THREE.Texture | undefined {
  if (!input) return undefined

  // A THREE.Texture from another node lives in the ThreeShaderRenderer's WebGL context; GPU
  // residency is per-context, so sampling it here is BLANK. Re-source it in this context:
  // canvas/video-backed → rebuild from the DOM element (cached per slot); a shader render
  // target (no DOM image) → read it back into a per-slot canvas each frame.
  if (input instanceof THREE.Texture) {
    const img = input.image as unknown
    if (img instanceof HTMLVideoElement || img instanceof HTMLCanvasElement) {
      return convertToThreeTexture(img, cacheKey, nodeId, width, height)
    }
    if (input.isRenderTargetTexture) {
      let canvas = rtReadbackCanvases.get(cacheKey)
      if (!canvas) {
        canvas = document.createElement('canvas')
        rtReadbackCanvases.set(cacheKey, canvas)
      }
      const dims = img as { width?: number; height?: number } | null
      const w = dims?.width || width
      const h = dims?.height || height
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      getThreeShaderRenderer().renderToCanvas(input, canvas)
      return convertToThreeTexture(canvas, cacheKey, nodeId, width, height)
    }
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
      // Track for O(1) disposal
      if (nodeId) trackTextureKey(nodeId, cacheKey)
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
    // Use provided dimensions (defaulted to 512x512 if not specified)
    const texture = renderer.createTextureFromWebGL(input, width, height)

    // Cache the data texture
    const existing = dataTextures.get(cacheKey)
    if (existing) {
      existing.dispose()
    }
    dataTextures.set(cacheKey, texture)
    // Track for O(1) disposal
    if (nodeId) trackTextureKey(nodeId, cacheKey)

    return texture
  }

  // If it's a canvas element, create or reuse CanvasTexture
  if (input instanceof HTMLCanvasElement) {
    // Keyed per slot (cacheKey), not per node: two canvas maps on one material (color + normal)
    // used to share ONE CanvasTexture, so both slots showed whichever canvas came last.
    const canvasKey = `canvas_${cacheKey}`
    let canvasTex = canvasTextures.get(canvasKey)
    if (!canvasTex) {
      canvasTex = new THREE.CanvasTexture(input)
      canvasTextures.set(canvasKey, canvasTex)
      if (nodeId) trackTextureKey(nodeId, canvasKey)
    } else if (canvasTex.image !== input) {
      // Canvas changed, update reference
      canvasTex.image = input
    }
    canvasTex.needsUpdate = true
    return canvasTex
  }

  return undefined
}

/**
 * Helper to dispose a GLTF group and all its resources
 */
export function disposeGLTFGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else if (child.material) {
        child.material.dispose()
      }
    }
  })
}

/**
 * Dispose 3D resources for a node
 */
export function dispose3DNode(nodeId: string): void {
  const obj = nodeObjects.get(nodeId)
  if (obj) {
    obj.parent?.remove(obj)
    if (obj instanceof THREE.Mesh) {
      // Geometry is node-owned; the material is disposed only if it's this node's default —
      // a wired one belongs to its Material 3D node (and may be shared by other meshes).
      obj.geometry?.dispose()
    } else if (obj instanceof THREE.Light) {
      obj.dispose() // frees the shadow map render target
    }
    nodeObjects.delete(nodeId)
  }
  primitiveDefaultMaterials.get(nodeId)?.dispose()
  primitiveDefaultMaterials.delete(nodeId)
  primitiveGeoKeys.delete(nodeId)
  disposeSceneNodeState(nodeId)
  gltfLoadState.delete(nodeId)
  // Light clones held by a group own their own shadow maps
  for (const clone of groupState.get(nodeId)?.clones ?? []) {
    clone.traverse((o) => {
      if (o instanceof THREE.Light) o.dispose()
    })
  }

  const mat = nodeMaterials.get(nodeId)
  if (mat) {
    mat.dispose()
    nodeMaterials.delete(nodeId)
  }

  nodeSceneRefs.delete(nodeId)

  const gltf = loadedGLTFs.get(nodeId)
  if (gltf) {
    disposeGLTFGroup(gltf)
    loadedGLTFs.delete(nodeId)
    loadedGLTFUrls.delete(nodeId)
  }

  // Dispose cached textures for this node - O(1) lookup using nodeTextureKeys
  const textureKeys = nodeTextureKeys.get(nodeId)
  if (textureKeys) {
    for (const key of textureKeys) {
      const videoTex = videoTextures.get(key)
      if (videoTex) {
        videoTex.dispose()
        videoTextures.delete(key)
      }
      const dataTex = dataTextures.get(key)
      if (dataTex) {
        dataTex.dispose()
        dataTextures.delete(key)
      }
      const canvasTex = canvasTextures.get(key)
      if (canvasTex) {
        canvasTex.dispose()
        canvasTextures.delete(key)
      }
      rtReadbackCanvases.delete(key.replace(/^canvas_/, ''))
    }
    nodeTextureKeys.delete(nodeId)
  }

  // Clean up group state (clones are already removed when group is disposed)
  groupState.delete(nodeId)

  // Also dispose from ThreeRenderer (scene / camera / render targets). Don't spin up a
  // WebGL context just to dispose nothing.
  peekThreeRenderer()?.disposeNode(nodeId)
}

/**
 * Dispose all 3D resources
 */
export function disposeAll3DNodes(): void {
  // Every node that owns anything: objects, scene nodes, GLTF loads, and renderer-side
  // scenes/cameras/render targets (render-3d / camera-3d / scene-3d own no nodeObjects entry).
  const ids = new Set<string>([
    ...nodeObjects.keys(),
    ...nodeMaterials.keys(),
    ...nodeTextureKeys.keys(),
    ...primitiveDefaultMaterials.keys(),
    ...sceneNodeState.keys(),
    ...gltfLoadState.keys(),
    ...(peekThreeRenderer()?.ownedNodeIds() ?? []),
  ])
  for (const nodeId of ids) {
    dispose3DNode(nodeId)
  }
  nodeObjects.clear()
  nodeMaterials.clear()
  nodeSceneRefs.clear()
  loadedGLTFs.clear()
  loadedGLTFUrls.clear()

  // Clear texture caches
  for (const tex of videoTextures.values()) {
    tex.dispose()
  }
  videoTextures.clear()

  for (const tex of dataTextures.values()) {
    tex.dispose()
  }
  dataTextures.clear()

  for (const tex of canvasTextures.values()) {
    tex.dispose()
  }
  canvasTextures.clear()
  rtReadbackCanvases.clear()

  // Clear texture tracking
  nodeTextureKeys.clear()

  // Clear group state
  groupState.clear()
}

/**
 * Garbage collect orphaned 3D state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gc3DState(validNodeIds: Set<string>): void {
  // Clean nodeObjects (dispose3DNode will handle texture cleanup via nodeTextureKeys), plus
  // nodes whose only state is a scene / camera / render target in the ThreeRenderer — a
  // deleted Scene/Camera/Render 3D node previously leaked those forever.
  const owners = new Set<string>([
    ...nodeObjects.keys(),
    ...nodeMaterials.keys(),
    ...nodeTextureKeys.keys(),
    ...primitiveDefaultMaterials.keys(),
    ...sceneNodeState.keys(),
    ...gltfLoadState.keys(),
    ...(peekThreeRenderer()?.ownedNodeIds() ?? []),
  ])
  for (const nodeId of owners) {
    if (!validNodeIds.has(nodeId)) {
      dispose3DNode(nodeId)
    }
  }

  // Clean nodeMaterials (may have been missed)
  for (const nodeId of nodeMaterials.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const mat = nodeMaterials.get(nodeId)
      if (mat) mat.dispose()
      nodeMaterials.delete(nodeId)
    }
  }

  // Clean nodeSceneRefs
  for (const nodeId of nodeSceneRefs.keys()) {
    if (!validNodeIds.has(nodeId)) {
      nodeSceneRefs.delete(nodeId)
    }
  }

  // Clean loadedGLTFs (dispose resources before removing)
  for (const nodeId of loadedGLTFs.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const gltf = loadedGLTFs.get(nodeId)
      if (gltf) disposeGLTFGroup(gltf)
      loadedGLTFs.delete(nodeId)
      loadedGLTFUrls.delete(nodeId)
    }
  }

  // Clean orphaned nodeTextureKeys and their textures
  for (const nodeId of nodeTextureKeys.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const textureKeys = nodeTextureKeys.get(nodeId)
      if (textureKeys) {
        for (const key of textureKeys) {
          const videoTex = videoTextures.get(key)
          if (videoTex) {
            videoTex.dispose()
            videoTextures.delete(key)
          }
          const dataTex = dataTextures.get(key)
          if (dataTex) {
            dataTex.dispose()
            dataTextures.delete(key)
          }
          const canvasTex = canvasTextures.get(key)
          if (canvasTex) {
            canvasTex.dispose()
            canvasTextures.delete(key)
          }
        }
      }
      nodeTextureKeys.delete(nodeId)
    }
  }

  // Clean orphaned groupState entries
  for (const nodeId of groupState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      groupState.delete(nodeId)
    }
  }
}

// ============================================================================
// Registry
// ============================================================================

// 3D state cleanup self-registers with the engine's generic lifecycle loop
// (was hand-wired as gc3DState / disposeAll3DNodes calls in ExecutionEngine).
// defineLifecycle-wrap: the Three.js scene/geometry/texture teardown is unchanged,
// only invoked generically instead of by an explicit engine call.
defineLifecycle({
  label: '3d',
  gc: gc3DState,
  disposeAll: disposeAll3DNodes,
})
