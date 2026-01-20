/**
 * Three.js-based 2D Shader Renderer
 *
 * Uses Three.js for 2D shader rendering with proper per-node render targets.
 * This solves the critical bugs in the original ShaderRenderer:
 * 1. Proper per-node framebuffer management via WebGLRenderTarget
 * 2. Correct texture-to-canvas display via renderToCanvas()
 * 3. Clean uniform management via ShaderMaterial
 */

import * as THREE from 'three'

export interface CompiledShaderMaterial {
  material: THREE.ShaderMaterial
  uniforms: THREE.ShaderMaterialParameters['uniforms']
}

export interface ThreeShaderUniform {
  name: string
  type: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'samplerCube'
  value: number | number[] | THREE.Texture | null
}

// Default vertex shader for fullscreen quad
const DEFAULT_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Shadertoy compatibility wrapper - prepended to user's fragment shader
const SHADERTOY_WRAPPER_PREFIX = `
varying vec2 vUv;

uniform float iTime;
uniform vec2 iResolution;
uniform vec4 iMouse;
uniform int iFrame;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

`

const SHADERTOY_WRAPPER_SUFFIX = `
void main() {
  vec4 fragColor;
  mainImage(fragColor, vUv * iResolution);
  gl_FragColor = fragColor;
}
`

// Raw GLSL fragment shader prefix (non-Shadertoy mode)
const RAW_FRAGMENT_PREFIX = `
varying vec2 vUv;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_mouse;
uniform int u_frame;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

// Shadertoy compatibility aliases
#define iTime u_time
#define iResolution u_resolution
#define iMouse u_mouse
#define iFrame u_frame
`

// Effect shader prefix - minimal wrapper for post-processing effects
const EFFECT_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const EFFECT_FRAGMENT_PREFIX = `
varying vec2 vUv;
`

export class ThreeShaderRenderer {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private quad: THREE.Mesh
  private renderTargets: Map<string, THREE.WebGLRenderTarget> = new Map()
  private materials: Map<string, THREE.ShaderMaterial> = new Map()
  private effectShaders: Map<string, CompiledShaderMaterial> = new Map()
  private defaultSize = { width: 512, height: 512 }

  // Time and frame tracking
  private _time = 0
  private _frame = 0
  private _mouseX = 0
  private _mouseY = 0
  private _mouseDown = false

  // Context loss handling
  private _contextLost = false
  private _boundContextLost: ((e: Event) => void) | null = null
  private _boundContextRestored: ((e: Event) => void) | null = null

  // Blank texture for unbound samplers
  private blankTexture: THREE.DataTexture

  // Cached display material for renderToCanvas
  private displayMaterial: THREE.MeshBasicMaterial | null = null

  // Track if we're using a shared renderer (from UnifiedRenderer)
  private _usesSharedRenderer = false

  constructor(sharedRenderer?: THREE.WebGLRenderer) {
    if (sharedRenderer) {
      // Use shared renderer from UnifiedRenderer
      this.renderer = sharedRenderer
      this.canvas = sharedRenderer.domElement
      this._usesSharedRenderer = true
    } else {
      // Create a dedicated canvas for Three.js 2D shader rendering
      this.canvas = document.createElement('canvas')
      this.canvas.width = this.defaultSize.width
      this.canvas.height = this.defaultSize.height

      // Create WebGL renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      })
      this.renderer.setSize(this.defaultSize.width, this.defaultSize.height)
      this.renderer.setPixelRatio(1)
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    }

    // Create orthographic camera for 2D rendering
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.z = 1

    // Create scene
    this.scene = new THREE.Scene()

    // Create fullscreen quad geometry
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 })
    this.quad = new THREE.Mesh(geometry, material)
    this.scene.add(this.quad)

    // Create blank texture for unbound samplers
    const blankData = new Uint8Array([0, 0, 0, 255])
    this.blankTexture = new THREE.DataTexture(blankData, 1, 1, THREE.RGBAFormat)
    this.blankTexture.needsUpdate = true

    if (!sharedRenderer) {
      this.setupContextLossHandling()
    }
  }

  /**
   * Check if using shared renderer from UnifiedRenderer
   */
  usesSharedRenderer(): boolean {
    return this._usesSharedRenderer
  }

  /**
   * Setup WebGL context loss/restore handling
   */
  private setupContextLossHandling(): void {
    this._boundContextLost = (e: Event) => {
      e.preventDefault()
      this._contextLost = true
      console.warn('[ThreeShaderRenderer] WebGL context lost')
      // Clear caches - GPU resources are invalid
      this.renderTargets.clear()
      this.materials.clear()
    }

    this._boundContextRestored = () => {
      console.log('[ThreeShaderRenderer] WebGL context restored')
      this._contextLost = false
      // Resources will be recreated on demand
    }

    this.canvas.addEventListener('webglcontextlost', this._boundContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._boundContextRestored)
  }

  /**
   * Check if context is lost
   */
  isContextLost(): boolean {
    return this._contextLost
  }

  /**
   * Generate GLSL uniform declarations from uniform definitions
   * Skips uniforms that are already declared in the source code
   */
  private generateUniformDeclarations(
    uniformDefs: Array<{ name: string; type: string; default?: unknown }>,
    existingSource?: string
  ): string {
    if (!uniformDefs || uniformDefs.length === 0) return ''

    const declarations: string[] = []
    for (const def of uniformDefs) {
      // Skip if this uniform is already declared in the source code
      if (existingSource) {
        // Check for existing declaration pattern: uniform <type> <name>;
        const alreadyDeclared = new RegExp(
          `uniform\\s+(?:lowp|mediump|highp)?\\s*\\w+\\s+${def.name}\\s*;`
        ).test(existingSource)
        if (alreadyDeclared) continue
      }

      // Map type to GLSL type
      let glslType = def.type
      if (def.type === 'int') glslType = 'int'
      else if (def.type === 'float') glslType = 'float'
      else if (def.type === 'vec2') glslType = 'vec2'
      else if (def.type === 'vec3') glslType = 'vec3'
      else if (def.type === 'vec4') glslType = 'vec4'
      else if (def.type === 'sampler2D') glslType = 'sampler2D'

      declarations.push(`uniform ${glslType} ${def.name};`)
    }
    return declarations.length > 0 ? declarations.join('\n') + '\n' : ''
  }

  /**
   * Compile a shader into a Three.js ShaderMaterial
   */
  compileShader(
    fragmentSource: string,
    vertexSource?: string,
    isShadertoy: boolean = false,
    uniformDefs?: Array<{ name: string; type: string; default?: unknown }>
  ): CompiledShaderMaterial | { error: string } {
    try {
      let finalFragmentSource: string
      const finalVertexSource = vertexSource || DEFAULT_VERTEX_SHADER

      // Generate uniform declarations from definitions (skipping any already in the source)
      const userUniformDeclarations = this.generateUniformDeclarations(uniformDefs || [], fragmentSource)

      if (isShadertoy) {
        // Wrap Shadertoy-style shaders with user uniform declarations
        finalFragmentSource = SHADERTOY_WRAPPER_PREFIX + userUniformDeclarations + fragmentSource + SHADERTOY_WRAPPER_SUFFIX
      } else {
        // Check if user provided their own main(), if not add raw prefix
        if (fragmentSource.includes('void main')) {
          finalFragmentSource = RAW_FRAGMENT_PREFIX + userUniformDeclarations + fragmentSource
        } else {
          // Assume it's Shadertoy-style even without explicit flag
          finalFragmentSource = SHADERTOY_WRAPPER_PREFIX + userUniformDeclarations + fragmentSource + SHADERTOY_WRAPPER_SUFFIX
        }
      }

      // Create uniforms object with built-in uniforms
      const uniforms: THREE.ShaderMaterialParameters['uniforms'] = {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(this.defaultSize.width, this.defaultSize.height) },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        iFrame: { value: 0 },
        iChannel0: { value: this.blankTexture },
        iChannel1: { value: this.blankTexture },
        iChannel2: { value: this.blankTexture },
        iChannel3: { value: this.blankTexture },
        // Raw uniform aliases
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(this.defaultSize.width, this.defaultSize.height) },
        u_mouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        u_frame: { value: 0 },
      }

      // Add user-defined uniforms with default values
      if (uniformDefs) {
        for (const def of uniformDefs) {
          if (def.type === 'float' || def.type === 'int') {
            uniforms[def.name] = { value: def.default ?? 0 }
          } else if (def.type === 'vec2') {
            const val = Array.isArray(def.default) ? def.default : [0, 0]
            uniforms[def.name] = { value: new THREE.Vector2(val[0], val[1]) }
          } else if (def.type === 'vec3') {
            const val = Array.isArray(def.default) ? def.default : [0, 0, 0]
            uniforms[def.name] = { value: new THREE.Vector3(val[0], val[1], val[2]) }
          } else if (def.type === 'vec4') {
            const val = Array.isArray(def.default) ? def.default : [0, 0, 0, 1]
            uniforms[def.name] = { value: new THREE.Vector4(val[0], val[1], val[2], val[3]) }
          } else if (def.type === 'sampler2D' || def.type === 'samplerCube') {
            // Note: samplerCube uses same blank texture for now (cubemaps not fully supported)
            uniforms[def.name] = { value: this.blankTexture }
          }
        }
      }

      // Create ShaderMaterial
      const material = new THREE.ShaderMaterial({
        vertexShader: finalVertexSource,
        fragmentShader: finalFragmentSource,
        uniforms,
        glslVersion: THREE.GLSL1, // Use GLSL 1.0 for Shadertoy compatibility
      })

      // Force compilation and check for errors
      // Three.js doesn't throw on shader errors - it logs them and renders blank
      // We need to explicitly check the WebGL context for compilation errors
      const originalMaterial = this.quad.material
      this.quad.material = material

      // Capture console errors during compilation (Three.js logs shader errors)
      // Use object to avoid TypeScript closure inference issues
      const errorCapture = { message: null as string | null }
      const originalConsoleError = console.error
      console.error = (...args: unknown[]) => {
        const message = args.map(a => String(a)).join(' ')
        // Only catch actual shader compilation errors - be specific to avoid false positives
        // Three.js shader errors look like: "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false"
        // followed by "ERROR: 0:XX: ..." lines
        const isShaderError =
          (message.includes('THREE.WebGLProgram') && message.includes('Shader Error')) ||
          (message.includes('ERROR:') && /ERROR:\s*\d+:\d+:/.test(message))
        if (isShaderError) {
          if (!errorCapture.message) {
            errorCapture.message = message
          }
        }
        originalConsoleError.apply(console, args)
      }

      try {
        // Create a temporary render target for validation
        const tempTarget = new THREE.WebGLRenderTarget(1, 1)
        this.renderer.setRenderTarget(tempTarget)
        this.renderer.render(this.scene, this.camera)
        this.renderer.setRenderTarget(null)
        tempTarget.dispose()
      } catch (renderError) {
        console.error = originalConsoleError
        this.quad.material = originalMaterial
        material.dispose()
        return { error: renderError instanceof Error ? renderError.message : 'Shader compilation failed' }
      }

      // Restore console.error
      console.error = originalConsoleError

      // Check if shader compilation failed (Three.js logged an error)
      if (errorCapture.message) {
        this.quad.material = originalMaterial
        material.dispose()
        // Extract just the error lines for cleaner display
        const errorMatch = errorCapture.message.match(/ERROR: \d+:\d+:.*$/m)
        return { error: errorMatch ? errorMatch[0] : 'Shader compilation failed' }
      }

      this.quad.material = originalMaterial

      return { material, uniforms }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown compilation error'
      return { error: msg }
    }
  }

  /**
   * Render a shader to a per-node render target
   * Returns the Three.js Texture (not raw WebGLTexture)
   */
  render(
    shader: CompiledShaderMaterial,
    userUniforms: ThreeShaderUniform[] = [],
    nodeId: string,
    width: number = this.defaultSize.width,
    height: number = this.defaultSize.height
  ): THREE.Texture | null {
    if (this._contextLost) return null

    // Get or create render target for this node
    const target = this.getOrCreateRenderTarget(nodeId, width, height)

    // Update built-in uniforms
    const uniforms = shader.uniforms
    if (!uniforms) return null

    uniforms.iTime.value = this._time
    uniforms.iResolution.value.set(width, height)
    uniforms.iMouse.value.set(this._mouseX, this._mouseY, this._mouseDown ? 1 : 0, 0)
    uniforms.iFrame.value = this._frame

    // Update raw aliases
    uniforms.u_time.value = this._time
    uniforms.u_resolution.value.set(width, height)
    uniforms.u_mouse.value.set(this._mouseX, this._mouseY, this._mouseDown ? 1 : 0, 0)
    uniforms.u_frame.value = this._frame

    // Reset channels to blank texture
    uniforms.iChannel0.value = this.blankTexture
    uniforms.iChannel1.value = this.blankTexture
    uniforms.iChannel2.value = this.blankTexture
    uniforms.iChannel3.value = this.blankTexture

    // Apply user uniforms
    for (const uniform of userUniforms) {
      // Create uniform if it doesn't exist
      if (!uniforms[uniform.name]) {
        uniforms[uniform.name] = { value: null }
        shader.material.needsUpdate = true
      }

      // Handle different types
      if (uniform.type === 'sampler2D') {
        if (uniform.value instanceof THREE.Texture) {
          uniforms[uniform.name].value = uniform.value
        } else if (uniform.value === null) {
          uniforms[uniform.name].value = this.blankTexture
        }
      } else if (uniform.type === 'vec2' && Array.isArray(uniform.value)) {
        if (uniforms[uniform.name].value instanceof THREE.Vector2) {
          uniforms[uniform.name].value.set(uniform.value[0], uniform.value[1])
        } else {
          uniforms[uniform.name].value = new THREE.Vector2(uniform.value[0], uniform.value[1])
        }
      } else if (uniform.type === 'vec3' && Array.isArray(uniform.value)) {
        if (uniforms[uniform.name].value instanceof THREE.Vector3) {
          uniforms[uniform.name].value.set(uniform.value[0], uniform.value[1], uniform.value[2])
        } else {
          uniforms[uniform.name].value = new THREE.Vector3(
            uniform.value[0],
            uniform.value[1],
            uniform.value[2]
          )
        }
      } else if (uniform.type === 'vec4' && Array.isArray(uniform.value)) {
        if (uniforms[uniform.name].value instanceof THREE.Vector4) {
          uniforms[uniform.name].value.set(
            uniform.value[0],
            uniform.value[1],
            uniform.value[2],
            uniform.value[3]
          )
        } else {
          uniforms[uniform.name].value = new THREE.Vector4(
            uniform.value[0],
            uniform.value[1],
            uniform.value[2],
            uniform.value[3]
          )
        }
      } else {
        uniforms[uniform.name].value = uniform.value
      }
    }

    // Set the shader material on the quad
    this.quad.material = shader.material

    // Render to the target
    // Note: Don't call setSize here - the render target already has the correct size
    // setSize changes the renderer's canvas/viewport which can cause issues
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    this._frame++

    return target.texture
  }

  /**
   * Render a shader directly to the internal canvas (for preview)
   */
  renderToScreen(
    shader: CompiledShaderMaterial,
    userUniforms: ThreeShaderUniform[] = [],
    width: number = this.defaultSize.width,
    height: number = this.defaultSize.height
  ): void {
    if (this._contextLost) return
    if (!shader || !shader.material) return

    // Update built-in uniforms
    const uniforms = shader.uniforms
    if (!uniforms) return

    uniforms.iTime.value = this._time
    uniforms.iResolution.value.set(width, height)
    uniforms.iMouse.value.set(this._mouseX, this._mouseY, this._mouseDown ? 1 : 0, 0)
    uniforms.iFrame.value = this._frame
    uniforms.u_time.value = this._time
    uniforms.u_resolution.value.set(width, height)
    uniforms.u_mouse.value.set(this._mouseX, this._mouseY, this._mouseDown ? 1 : 0, 0)
    uniforms.u_frame.value = this._frame

    // Reset channels
    uniforms.iChannel0.value = this.blankTexture
    uniforms.iChannel1.value = this.blankTexture
    uniforms.iChannel2.value = this.blankTexture
    uniforms.iChannel3.value = this.blankTexture

    // Apply user uniforms
    for (const uniform of userUniforms) {
      if (!uniforms[uniform.name]) {
        uniforms[uniform.name] = { value: null }
        shader.material.needsUpdate = true
      }

      if (uniform.type === 'sampler2D') {
        uniforms[uniform.name].value =
          uniform.value instanceof THREE.Texture ? uniform.value : this.blankTexture
      } else if (uniform.type === 'vec2' && Array.isArray(uniform.value)) {
        if (!(uniforms[uniform.name].value instanceof THREE.Vector2)) {
          uniforms[uniform.name].value = new THREE.Vector2()
        }
        uniforms[uniform.name].value.set(uniform.value[0], uniform.value[1])
      } else if (uniform.type === 'vec3' && Array.isArray(uniform.value)) {
        if (!(uniforms[uniform.name].value instanceof THREE.Vector3)) {
          uniforms[uniform.name].value = new THREE.Vector3()
        }
        uniforms[uniform.name].value.set(uniform.value[0], uniform.value[1], uniform.value[2])
      } else if (uniform.type === 'vec4' && Array.isArray(uniform.value)) {
        if (!(uniforms[uniform.name].value instanceof THREE.Vector4)) {
          uniforms[uniform.name].value = new THREE.Vector4()
        }
        uniforms[uniform.name].value.set(
          uniform.value[0],
          uniform.value[1],
          uniform.value[2],
          uniform.value[3]
        )
      } else {
        uniforms[uniform.name].value = uniform.value
      }
    }

    // Set material and render
    this.quad.material = shader.material

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.renderer.setSize(width, height)
    }

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)

    this._frame++
  }

  /**
   * Compile an effect shader (for post-processing like blend, blur, etc.)
   * These are simpler shaders that just process textures without Shadertoy wrapper
   */
  compileEffectShader(
    fragmentSource: string,
    effectId: string
  ): CompiledShaderMaterial | { error: string } {
    // Check cache first
    const cached = this.effectShaders.get(effectId)
    if (cached) return cached

    try {
      // Effect shaders use simple UV-based fragment shaders
      const finalFragmentSource = EFFECT_FRAGMENT_PREFIX + fragmentSource

      // Parse uniforms from the shader source
      const uniformDeclarations = fragmentSource.match(/uniform\s+(\w+)\s+(\w+)\s*;/g) || []
      const uniforms: THREE.ShaderMaterialParameters['uniforms'] = {}

      for (const decl of uniformDeclarations) {
        const match = decl.match(/uniform\s+(\w+)\s+(\w+)\s*;/)
        if (match) {
          const [, type, name] = match
          if (type === 'sampler2D') {
            uniforms[name] = { value: this.blankTexture }
          } else if (type === 'float') {
            uniforms[name] = { value: 0.0 }
          } else if (type === 'int') {
            uniforms[name] = { value: 0 }
          } else if (type === 'vec2') {
            uniforms[name] = { value: new THREE.Vector2() }
          } else if (type === 'vec3') {
            uniforms[name] = { value: new THREE.Vector3() }
          } else if (type === 'vec4') {
            uniforms[name] = { value: new THREE.Vector4() }
          }
        }
      }

      const material = new THREE.ShaderMaterial({
        vertexShader: EFFECT_VERTEX_SHADER,
        fragmentShader: finalFragmentSource,
        uniforms,
        glslVersion: THREE.GLSL1,
      })

      const result = { material, uniforms }
      this.effectShaders.set(effectId, result)
      return result
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Effect shader compilation failed' }
    }
  }

  /**
   * Get or create a cached effect shader
   */
  getEffectShader(effectId: string): CompiledShaderMaterial | null {
    return this.effectShaders.get(effectId) || null
  }

  /**
   * Copy a Three.js Texture to a 2D canvas for display
   * For render target textures, we need to read pixels directly from the GPU
   */
  renderToCanvas(texture: THREE.Texture, targetCanvas: HTMLCanvasElement): void {
    if (this._contextLost || !texture) return

    const ctx = targetCanvas.getContext('2d')
    if (!ctx) return

    const width = targetCanvas.width
    const height = targetCanvas.height

    // Check if this is a render target texture (has no image source but has dimensions)
    // Render target textures need to be read back from GPU via their render target
    const isRenderTargetTexture = texture.source?.data === null || texture.image === null

    // Debug logging
    if (Math.random() < 0.01) {
      console.log(`[renderToCanvas] texture uuid=${texture.uuid}, isRenderTarget=${isRenderTargetTexture}, renderTargets count=${this.renderTargets.size}`)
    }

    if (isRenderTargetTexture) {
      // Find the render target that owns this texture
      for (const [key, target] of this.renderTargets) {
        if (target.texture === texture) {
          if (Math.random() < 0.01) {
            console.log(`[renderToCanvas] Found matching render target: ${key}`)
          }
          // Read pixels from render target
          const rtWidth = target.width
          const rtHeight = target.height
          const pixels = new Uint8Array(rtWidth * rtHeight * 4)

          this.renderer.readRenderTargetPixels(target, 0, 0, rtWidth, rtHeight, pixels)

          // Create ImageData and draw to canvas
          // WebGL pixels are bottom-to-top, need to flip
          const flippedPixels = new Uint8ClampedArray(rtWidth * rtHeight * 4)
          for (let y = 0; y < rtHeight; y++) {
            const srcRow = (rtHeight - 1 - y) * rtWidth * 4
            const dstRow = y * rtWidth * 4
            flippedPixels.set(pixels.subarray(srcRow, srcRow + rtWidth * 4), dstRow)
          }

          const imageData = new ImageData(flippedPixels, rtWidth, rtHeight)

          // Scale to target canvas size
          if (rtWidth !== width || rtHeight !== height) {
            // Create temp canvas at render target size
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = rtWidth
            tempCanvas.height = rtHeight
            const tempCtx = tempCanvas.getContext('2d')!
            tempCtx.putImageData(imageData, 0, 0)
            ctx.drawImage(tempCanvas, 0, 0, width, height)
          } else {
            ctx.putImageData(imageData, 0, 0)
          }
          return
        }
      }
      // Render target texture but no matching target found
      if (Math.random() < 0.01) {
        console.warn(`[renderToCanvas] Render target texture but no matching target found! uuid=${texture.uuid}`)
        console.log(`[renderToCanvas] Available targets:`, [...this.renderTargets.keys()])
      }
    }

    // For regular textures (images, video, canvas), use MeshBasicMaterial approach
    if (!this.displayMaterial) {
      this.displayMaterial = new THREE.MeshBasicMaterial()
    }
    this.displayMaterial.map = texture
    this.displayMaterial.needsUpdate = true
    this.quad.material = this.displayMaterial

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.renderer.setSize(width, height)
    }

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)

    // Copy to target canvas
    ctx.drawImage(this.canvas, 0, 0)
  }

  /**
   * Get or create a render target for a node
   */
  private getOrCreateRenderTarget(
    nodeId: string,
    width: number,
    height: number
  ): THREE.WebGLRenderTarget {
    const key = `${nodeId}_${width}_${height}`
    let target = this.renderTargets.get(key)

    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      })
      this.renderTargets.set(key, target)
    }

    return target
  }

  /**
   * Get the texture for a node (if rendered)
   */
  getNodeTexture(nodeId: string, width?: number, height?: number): THREE.Texture | null {
    const w = width ?? this.defaultSize.width
    const h = height ?? this.defaultSize.height
    const key = `${nodeId}_${w}_${h}`
    return this.renderTargets.get(key)?.texture ?? null
  }

  /**
   * Create a Three.js Texture from an image, video, or canvas
   */
  createTexture(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): THREE.Texture {
    const texture = new THREE.Texture(source)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    return texture
  }

  /**
   * Update an existing texture with new content
   */
  updateTexture(texture: THREE.Texture, source: HTMLVideoElement | HTMLCanvasElement): void {
    texture.image = source
    texture.needsUpdate = true
  }

  /**
   * Create a Three.js Texture from raw WebGLTexture (for compatibility)
   */
  createTextureFromWebGL(
    webglTexture: WebGLTexture,
    width: number,
    height: number
  ): THREE.Texture | null {
    // Read pixels from WebGL texture and create a DataTexture
    const gl = this.renderer.getContext()

    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, webglTexture, 0)

    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)

    const dataTexture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
    dataTexture.flipY = true
    dataTexture.needsUpdate = true

    return dataTexture
  }

  /**
   * Update time for animations
   */
  setTime(time: number): void {
    this._time = time
  }

  /**
   * Update mouse position
   */
  setMouse(x: number, y: number, down: boolean): void {
    this._mouseX = x
    this._mouseY = y
    this._mouseDown = down
  }

  /**
   * Get the internal canvas
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /**
   * Get the WebGL context
   */
  getContext(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext
  }

  /**
   * Get the Three.js renderer (for sharing with ThreeRenderer)
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  /**
   * Set default render size
   */
  setDefaultSize(width: number, height: number): void {
    this.defaultSize = { width, height }
  }

  /**
   * Delete render target for a specific node
   */
  deleteRenderTarget(nodeId: string): void {
    // Delete all render targets for this node (any size)
    for (const [key, target] of this.renderTargets) {
      if (key.startsWith(`${nodeId}_`)) {
        target.dispose()
        this.renderTargets.delete(key)
      }
    }
  }

  /**
   * Dispose resources for a node
   */
  disposeNode(nodeId: string): void {
    this.deleteRenderTarget(nodeId)

    // Dispose materials for this node
    const material = this.materials.get(nodeId)
    if (material) {
      material.dispose()
      this.materials.delete(nodeId)
    }
  }

  /**
   * Get the render target for a specific node (if it exists)
   * Useful for texture bridge operations
   */
  getRenderTarget(nodeId: string, width?: number, height?: number): THREE.WebGLRenderTarget | null {
    const w = width ?? this.defaultSize.width
    const h = height ?? this.defaultSize.height
    const key = `${nodeId}_${w}_${h}`
    return this.renderTargets.get(key) ?? null
  }

  /**
   * Get all render targets (for debugging/introspection)
   */
  getAllRenderTargets(): Map<string, THREE.WebGLRenderTarget> {
    return this.renderTargets
  }

  /**
   * Reset renderer state (call before rendering in shared context mode)
   */
  resetState(): void {
    this.renderer.resetState()
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Remove event listeners (only if we own the canvas)
    if (!this._usesSharedRenderer) {
      if (this._boundContextLost) {
        this.canvas.removeEventListener('webglcontextlost', this._boundContextLost)
      }
      if (this._boundContextRestored) {
        this.canvas.removeEventListener('webglcontextrestored', this._boundContextRestored)
      }
    }

    // Dispose render targets
    for (const target of this.renderTargets.values()) {
      target.dispose()
    }
    this.renderTargets.clear()

    // Dispose materials
    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()

    // Dispose effect shaders
    for (const shader of this.effectShaders.values()) {
      shader.material.dispose()
    }
    this.effectShaders.clear()

    // Dispose display material
    if (this.displayMaterial) {
      this.displayMaterial.dispose()
      this.displayMaterial = null
    }

    // Dispose blank texture
    this.blankTexture.dispose()

    // Dispose quad geometry
    this.quad.geometry.dispose()

    // Only dispose renderer if we own it (not shared)
    if (!this._usesSharedRenderer) {
      this.renderer.dispose()
    }
  }
}

// Singleton instance
let sharedThreeShaderRenderer: ThreeShaderRenderer | null = null

export function getThreeShaderRenderer(): ThreeShaderRenderer {
  if (!sharedThreeShaderRenderer) {
    sharedThreeShaderRenderer = new ThreeShaderRenderer()
  }
  return sharedThreeShaderRenderer
}

export function disposeThreeShaderRenderer(): void {
  if (sharedThreeShaderRenderer) {
    sharedThreeShaderRenderer.dispose()
    sharedThreeShaderRenderer = null
  }
}

// Re-export THREE for convenience
export { THREE }
