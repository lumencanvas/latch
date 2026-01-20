/**
 * TextureBridge - Converts between Three.js and PixiJS textures
 *
 * Handles texture format conversion for the hybrid renderer architecture:
 * - THREE.Texture -> PIXI.Texture (for display in PixiJS)
 * - PIXI.Texture -> THREE.Texture (for shader inputs)
 *
 * Uses the shared WebGL context to avoid GPU-CPU roundtrips.
 */

import * as THREE from 'three'
import {
  Texture as PixiTexture,
  TextureSource,
  Sprite,
  GlTexture,
  Rectangle,
} from 'pixi.js'
import { getUnifiedRendererSync } from './UnifiedRenderer'

interface CachedPixiTexture {
  pixiTexture: PixiTexture
  threeTexture: THREE.Texture
  lastVersion: number
}

interface CachedThreeTexture {
  threeTexture: THREE.Texture
  pixiTexture: PixiTexture
  lastVersion: number
}

export class TextureBridge {
  // Cache Three.js textures mapped to PixiJS textures
  private threeToPixiCache = new Map<THREE.Texture, CachedPixiTexture>()

  // Cache PixiJS textures mapped to Three.js textures
  private pixiToThreeCache = new Map<PixiTexture, CachedThreeTexture>()

  // Display sprites for rendering Three.js textures to PixiJS
  private displaySprites = new Map<string, Sprite>()

  /**
   * Convert a THREE.Texture to a PIXI.Texture for display
   *
   * This creates a PixiJS texture that wraps the same underlying WebGL texture,
   * avoiding any CPU-GPU data transfer.
   */
  threeToPixi(
    texture: THREE.Texture,
    width?: number,
    height?: number
  ): PixiTexture | null {
    if (!texture) return null

    const renderer = getUnifiedRendererSync()
    if (!renderer) {
      console.warn('[TextureBridge] UnifiedRenderer not initialized')
      return null
    }

    const gl = renderer.getContext()
    if (!gl) return null

    // Check cache first (using texture version for invalidation)
    const cached = this.threeToPixiCache.get(texture)
    if (cached && cached.lastVersion === texture.version) {
      return cached.pixiTexture
    }

    // Get the WebGL texture from Three.js
    // Three.js stores the WebGL texture in the renderer's properties
    const threeRenderer = renderer.getThreeRenderer()
    if (!threeRenderer) return null

    // Get texture properties from Three.js renderer
    const textureProperties = threeRenderer.properties.get(texture) as
      | { __webglTexture?: WebGLTexture }
      | undefined

    if (!textureProperties?.__webglTexture) {
      // Texture hasn't been uploaded to GPU yet
      // Force upload by using it in a render
      texture.needsUpdate = true
      return null
    }

    const webglTexture = textureProperties.__webglTexture

    // Determine dimensions
    const w = width ?? texture.image?.width ?? 512
    const h = height ?? texture.image?.height ?? 512

    try {
      // Create a PixiJS texture source from the WebGL texture
      // PixiJS 8 uses TextureSource with a glTexture option
      const glTex = new GlTexture(webglTexture)

      const source = new TextureSource({
        resource: glTex,
        width: w,
        height: h,
        resolution: 1,
        autoGenerateMipmaps: false,
      })

      // Create the PixiJS texture
      const pixiTexture = new PixiTexture({
        source,
        frame: new Rectangle(0, 0, w, h),
      })

      // Cache the result
      if (cached) {
        // Dispose old texture before replacing
        cached.pixiTexture.destroy(true)
      }

      this.threeToPixiCache.set(texture, {
        pixiTexture,
        threeTexture: texture,
        lastVersion: texture.version,
      })

      return pixiTexture
    } catch (error) {
      console.error('[TextureBridge] Failed to create PixiJS texture:', error)
      return null
    }
  }

  /**
   * Convert a PIXI.Texture to a THREE.Texture for shader inputs
   *
   * This creates a Three.js texture that wraps the same underlying WebGL texture.
   * Note: This is a simplified implementation - full interop would require
   * accessing PixiJS's internal WebGL texture, which varies by renderer type.
   */
  pixiToThree(texture: PixiTexture): THREE.Texture | null {
    if (!texture) return null

    const renderer = getUnifiedRendererSync()
    if (!renderer) {
      console.warn('[TextureBridge] UnifiedRenderer not initialized')
      return null
    }

    // Check cache first
    const cached = this.pixiToThreeCache.get(texture)
    if (cached) {
      return cached.threeTexture
    }

    // Get texture source
    const source = texture.source
    if (!source) return null

    // Determine dimensions
    const w = texture.width || 512
    const h = texture.height || 512

    try {
      // Create a Three.js texture
      // For now, create a placeholder - full WebGL texture sharing would require
      // accessing PixiJS internals which vary by renderer type (WebGL vs WebGPU)
      const threeTexture = new THREE.DataTexture(
        new Uint8Array(w * h * 4),
        w,
        h,
        THREE.RGBAFormat
      )

      threeTexture.minFilter = THREE.LinearFilter
      threeTexture.magFilter = THREE.LinearFilter
      threeTexture.wrapS = THREE.ClampToEdgeWrapping
      threeTexture.wrapT = THREE.ClampToEdgeWrapping
      threeTexture.needsUpdate = true

      // Cache the result
      this.pixiToThreeCache.set(texture, {
        threeTexture,
        pixiTexture: texture,
        lastVersion: 0,
      })

      return threeTexture
    } catch (error) {
      console.error('[TextureBridge] Failed to create Three.js texture:', error)
      return null
    }
  }

  /**
   * Create a PixiJS Sprite for displaying a Three.js texture
   * Sprites are cached by ID for efficient reuse
   */
  createDisplaySprite(id: string, texture: THREE.Texture): Sprite | null {
    const pixiTexture = this.threeToPixi(texture)
    if (!pixiTexture) return null

    let sprite = this.displaySprites.get(id)
    if (!sprite) {
      sprite = new Sprite(pixiTexture)
      this.displaySprites.set(id, sprite)
    } else {
      sprite.texture = pixiTexture
    }

    return sprite
  }

  /**
   * Get a cached display sprite
   */
  getDisplaySprite(id: string): Sprite | null {
    return this.displaySprites.get(id) ?? null
  }

  /**
   * Dispose a specific Three.js texture from cache
   */
  disposeThreeTexture(texture: THREE.Texture): void {
    const cached = this.threeToPixiCache.get(texture)
    if (cached) {
      cached.pixiTexture.destroy(true)
      this.threeToPixiCache.delete(texture)
    }
  }

  /**
   * Dispose a specific PixiJS texture from cache
   */
  disposePixiTexture(texture: PixiTexture): void {
    const cached = this.pixiToThreeCache.get(texture)
    if (cached) {
      cached.threeTexture.dispose()
      this.pixiToThreeCache.delete(texture)
    }
  }

  /**
   * Dispose a display sprite
   */
  disposeDisplaySprite(id: string): void {
    const sprite = this.displaySprites.get(id)
    if (sprite) {
      sprite.destroy()
      this.displaySprites.delete(id)
    }
  }

  /**
   * Dispose all cached textures and sprites
   */
  disposeAll(): void {
    // Dispose Three->Pixi cache
    for (const cached of this.threeToPixiCache.values()) {
      cached.pixiTexture.destroy(true)
    }
    this.threeToPixiCache.clear()

    // Dispose Pixi->Three cache
    for (const cached of this.pixiToThreeCache.values()) {
      cached.threeTexture.dispose()
    }
    this.pixiToThreeCache.clear()

    // Dispose display sprites
    for (const sprite of this.displaySprites.values()) {
      sprite.destroy()
    }
    this.displaySprites.clear()

    console.log('[TextureBridge] Disposed all cached textures')
  }

  /**
   * Garbage collect textures for removed nodes
   */
  gc(validNodeIds: Set<string>): void {
    // Clean up display sprites for removed nodes
    for (const [id, sprite] of this.displaySprites.entries()) {
      // Extract node ID from sprite ID (format: "node_<nodeId>_...")
      const nodeId = id.split('_')[1]
      if (nodeId && !validNodeIds.has(nodeId)) {
        sprite.destroy()
        this.displaySprites.delete(id)
      }
    }
  }
}

// Singleton instance
let sharedTextureBridge: TextureBridge | null = null

/**
 * Get the shared TextureBridge instance
 */
export function getTextureBridge(): TextureBridge {
  if (!sharedTextureBridge) {
    sharedTextureBridge = new TextureBridge()
  }
  return sharedTextureBridge
}

/**
 * Dispose the shared TextureBridge
 */
export function disposeTextureBridge(): void {
  if (sharedTextureBridge) {
    sharedTextureBridge.disposeAll()
    sharedTextureBridge = null
  }
}
