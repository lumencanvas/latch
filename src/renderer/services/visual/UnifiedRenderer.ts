/**
 * UnifiedRenderer - Hybrid PixiJS 8 + Three.js Renderer
 *
 * Shares a single WebGL context between PixiJS and Three.js for efficient rendering:
 * - Three.js handles 3D scene rendering and shader execution
 * - PixiJS handles 2D compositing, display, and texture management
 *
 * The key insight is that both renderers can share the same WebGL context,
 * avoiding GPU-CPU roundtrips when displaying shader outputs.
 */

import * as THREE from 'three'
import { Application, Container } from 'pixi.js'

export interface UnifiedRendererOptions {
  width?: number
  height?: number
  antialias?: boolean
}

export class UnifiedRenderer {
  private threeRenderer: THREE.WebGLRenderer | null = null
  private pixiApp: Application | null = null
  private stage: Container | null = null
  private canvas: HTMLCanvasElement | null = null
  private _initialized = false
  private defaultSize = { width: 512, height: 512 }

  // Context loss handling
  private _contextLost = false
  private _boundContextLost: ((e: Event) => void) | null = null
  private _boundContextRestored: ((e: Event) => void) | null = null

  // Context loss callbacks for external cleanup
  private _contextLossCallbacks: Array<() => void> = []
  private _contextRestoreCallbacks: Array<() => void> = []

  /**
   * Initialize the unified renderer with a shared WebGL context
   */
  async init(options: UnifiedRendererOptions = {}): Promise<void> {
    if (this._initialized) return

    const width = options.width ?? this.defaultSize.width
    const height = options.height ?? this.defaultSize.height

    // Create canvas
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height

    // Three.js creates the WebGL context with stencil buffer for PixiJS masks
    this.threeRenderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      stencil: true,
      antialias: options.antialias ?? true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: true,
    })
    this.threeRenderer.setSize(width, height)
    this.threeRenderer.setPixelRatio(1)
    this.threeRenderer.outputColorSpace = THREE.LinearSRGBColorSpace

    // Get the WebGL context that Three.js created
    const gl = this.threeRenderer.getContext() as WebGL2RenderingContext

    // Initialize PixiJS Application sharing the same context
    this.pixiApp = new Application()
    await this.pixiApp.init({
      width,
      height,
      context: gl,
      clearBeforeRender: false, // Don't clear - we want to preserve Three.js renders
      backgroundAlpha: 0,
      hello: false, // Disable console greeting
    })

    this.stage = new Container()
    this.pixiApp.stage.addChild(this.stage)

    this._initialized = true
    this.setupContextLossHandling()

    console.log('[UnifiedRenderer] Initialized with shared WebGL context')
  }

  /**
   * Setup WebGL context loss/restore handling
   */
  private setupContextLossHandling(): void {
    if (!this.canvas) return

    this._boundContextLost = (e: Event) => {
      e.preventDefault()
      this._contextLost = true
      console.warn('[UnifiedRenderer] WebGL context lost')

      // Notify registered callbacks for cleanup
      for (const callback of this._contextLossCallbacks) {
        try {
          callback()
        } catch (err) {
          console.warn('[UnifiedRenderer] Context loss callback error:', err)
        }
      }
    }

    this._boundContextRestored = () => {
      console.log('[UnifiedRenderer] WebGL context restored')
      this._contextLost = false

      // Notify registered callbacks for restoration
      for (const callback of this._contextRestoreCallbacks) {
        try {
          callback()
        } catch (err) {
          console.warn('[UnifiedRenderer] Context restore callback error:', err)
        }
      }
    }

    this.canvas.addEventListener('webglcontextlost', this._boundContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._boundContextRestored)
  }

  /**
   * Register a callback for WebGL context loss
   */
  onContextLoss(callback: () => void): void {
    this._contextLossCallbacks.push(callback)
  }

  /**
   * Register a callback for WebGL context restoration
   */
  onContextRestore(callback: () => void): void {
    this._contextRestoreCallbacks.push(callback)
  }

  /**
   * Remove a context loss callback
   */
  offContextLoss(callback: () => void): void {
    const idx = this._contextLossCallbacks.indexOf(callback)
    if (idx !== -1) this._contextLossCallbacks.splice(idx, 1)
  }

  /**
   * Remove a context restore callback
   */
  offContextRestore(callback: () => void): void {
    const idx = this._contextRestoreCallbacks.indexOf(callback)
    if (idx !== -1) this._contextRestoreCallbacks.splice(idx, 1)
  }

  /**
   * Check if context is lost
   */
  isContextLost(): boolean {
    return this._contextLost
  }

  /**
   * Check if renderer is initialized
   */
  isInitialized(): boolean {
    return this._initialized
  }

  /**
   * Render a Three.js scene
   * Call this before renderPixi() if you want Three.js content behind PixiJS
   */
  renderThree(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.threeRenderer || this._contextLost) return

    // Reset Three.js state before rendering
    this.threeRenderer.resetState()
    this.threeRenderer.render(scene, camera)
  }

  /**
   * Render a Three.js scene to a render target
   * Returns the render target's texture
   */
  renderThreeToTarget(
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget
  ): THREE.Texture | null {
    if (!this.threeRenderer || this._contextLost) return null

    this.threeRenderer.resetState()
    this.threeRenderer.setRenderTarget(target)
    this.threeRenderer.render(scene, camera)
    this.threeRenderer.setRenderTarget(null)

    return target.texture
  }

  /**
   * Render the PixiJS stage
   * Call this after renderThree() if you want PixiJS content on top
   */
  renderPixi(): void {
    if (!this.pixiApp || !this.pixiApp.renderer || this._contextLost) return

    try {
      // Render the PixiJS stage
      this.pixiApp.renderer.render({ container: this.pixiApp.stage })
    } catch (e) {
      console.warn('[UnifiedRenderer] PixiJS render error:', e)
    }
  }

  /**
   * Get the Three.js WebGLRenderer
   */
  getThreeRenderer(): THREE.WebGLRenderer | null {
    return this.threeRenderer
  }

  /**
   * Get the PixiJS Application
   */
  getPixiApp(): Application | null {
    return this.pixiApp
  }

  /**
   * Get the PixiJS renderer
   */
  getPixiRenderer() {
    return this.pixiApp?.renderer ?? null
  }

  /**
   * Get the main PixiJS stage container
   */
  getStage(): Container | null {
    return this.stage
  }

  /**
   * Get the shared canvas element
   */
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas
  }

  /**
   * Get the shared WebGL context
   */
  getContext(): WebGL2RenderingContext | null {
    return this.threeRenderer?.getContext() as WebGL2RenderingContext ?? null
  }

  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    if (!this._initialized) return

    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }

    if (this.threeRenderer) {
      this.threeRenderer.setSize(width, height)
    }

    if (this.pixiApp) {
      this.pixiApp.renderer.resize(width, height)
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (!this._initialized) return

    // Mark as not initialized first to prevent re-entry
    this._initialized = false

    // Remove event listeners
    try {
      if (this.canvas && this._boundContextLost) {
        this.canvas.removeEventListener('webglcontextlost', this._boundContextLost)
      }
      if (this.canvas && this._boundContextRestored) {
        this.canvas.removeEventListener('webglcontextrestored', this._boundContextRestored)
      }
    } catch (e) {
      console.warn('[UnifiedRenderer] Error removing event listeners:', e)
    }

    // Dispose PixiJS stage first (before app)
    try {
      if (this.stage) {
        this.stage.destroy({ children: true })
      }
    } catch (e) {
      console.warn('[UnifiedRenderer] Error disposing stage:', e)
    }
    this.stage = null

    // Dispose PixiJS app
    try {
      if (this.pixiApp) {
        this.pixiApp.destroy(true)
      }
    } catch (e) {
      console.warn('[UnifiedRenderer] Error disposing PixiJS app:', e)
    }
    this.pixiApp = null

    // Dispose Three.js renderer last
    try {
      if (this.threeRenderer) {
        this.threeRenderer.dispose()
      }
    } catch (e) {
      console.warn('[UnifiedRenderer] Error disposing Three.js renderer:', e)
    }
    this.threeRenderer = null

    this.canvas = null
    this._boundContextLost = null
    this._boundContextRestored = null
    this._contextLossCallbacks = []
    this._contextRestoreCallbacks = []

    console.log('[UnifiedRenderer] Disposed')
  }
}

// Singleton instance
let sharedUnifiedRenderer: UnifiedRenderer | null = null
let initPromise: Promise<void> | null = null

/**
 * Get the shared UnifiedRenderer instance
 * Automatically initializes if not already done
 */
export async function getUnifiedRenderer(): Promise<UnifiedRenderer> {
  if (!sharedUnifiedRenderer) {
    sharedUnifiedRenderer = new UnifiedRenderer()
  }

  if (!sharedUnifiedRenderer.isInitialized()) {
    if (!initPromise) {
      initPromise = sharedUnifiedRenderer.init()
    }
    await initPromise
    initPromise = null
  }

  return sharedUnifiedRenderer
}

/**
 * Get the shared UnifiedRenderer instance synchronously
 * Returns null if not initialized
 */
export function getUnifiedRendererSync(): UnifiedRenderer | null {
  return sharedUnifiedRenderer?.isInitialized() ? sharedUnifiedRenderer : null
}

/**
 * Dispose the shared UnifiedRenderer
 */
export function disposeUnifiedRenderer(): void {
  if (sharedUnifiedRenderer) {
    sharedUnifiedRenderer.dispose()
    sharedUnifiedRenderer = null
  }
  initPromise = null
}

// Re-export THREE for convenience
export { THREE }
