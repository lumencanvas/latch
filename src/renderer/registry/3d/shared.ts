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
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'

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

// Track which texture keys belong to which node for O(1) disposal lookup
const nodeTextureKeys = new Map<string, Set<string>>()

// Track group state for efficient updates (avoid cloning every frame)
export const groupState = new Map<string, {
  inputIds: string[] // UUIDs of input objects
  clones: THREE.Object3D[] // References to our clones
}>()

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
    const cacheKey = `canvas_${nodeId ?? 'unknown'}`
    let canvasTex = canvasTextures.get(cacheKey)
    if (!canvasTex) {
      canvasTex = new THREE.CanvasTexture(input)
      canvasTextures.set(cacheKey, canvasTex)
      if (nodeId) trackTextureKey(nodeId, cacheKey)
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
    }
    nodeTextureKeys.delete(nodeId)
  }

  // Clean up group state (clones are already removed when group is disposed)
  groupState.delete(nodeId)

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
  // Clean nodeObjects (dispose3DNode will handle texture cleanup via nodeTextureKeys)
  for (const nodeId of nodeObjects.keys()) {
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
