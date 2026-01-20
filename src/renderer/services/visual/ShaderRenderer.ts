/**
 * Shader Renderer - WebGL2 shader compilation and rendering
 *
 * Handles:
 * - Shader compilation and linking
 * - Uniform management
 * - Texture binding
 * - Framebuffer rendering
 */

export interface ShaderUniform {
  name: string
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'sampler2D'
  value: number | number[] | WebGLTexture | null
}

export interface CompiledShader {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation>
  attributes: Map<string, number>
}

// Default vertex shader for fullscreen quad
const DEFAULT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Shadertoy compatibility wrapper
const SHADERTOY_WRAPPER_PREFIX = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform float iTime;
uniform vec2 iResolution;
uniform vec4 iMouse;
uniform int iFrame;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

#define fragCoord (v_texCoord * iResolution)
`

const SHADERTOY_WRAPPER_SUFFIX = `
void main() {
  mainImage(fragColor, fragCoord);
}
`

export class ShaderRenderer {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private quadBuffer: WebGLBuffer | null = null
  private shaderCache: Map<string, CompiledShader> = new Map()
  private framebuffers: Map<string, { fbo: WebGLFramebuffer; texture: WebGLTexture }> = new Map()
  private _time = 0
  private _frame = 0
  private _mouseX = 0
  private _mouseY = 0
  private _mouseDown = false
  private _contextLost = false
  private _boundContextLost: ((e: Event) => void) | null = null
  private _boundContextRestored: ((e: Event) => void) | null = null

  constructor(canvas?: HTMLCanvasElement) {
    // Create or use provided canvas
    this.canvas = canvas ?? document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 512

    // Get WebGL2 context
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    })

    if (!gl) {
      throw new Error('WebGL2 not supported')
    }

    this.gl = gl
    this.initQuadBuffer()
    this.setupContextLossHandling()
  }

  /**
   * Setup WebGL context loss/restore handling
   */
  private setupContextLossHandling(): void {
    this._boundContextLost = (e: Event) => {
      e.preventDefault()
      this._contextLost = true
      console.warn('[ShaderRenderer] WebGL context lost')
      // Clear all caches - GPU resources are invalid
      this.shaderCache.clear()
      this.framebuffers.clear()
      this.quadBuffer = null
    }

    this._boundContextRestored = () => {
      console.log('[ShaderRenderer] WebGL context restored')
      this._contextLost = false
      // Reinitialize quad buffer
      this.initQuadBuffer()
      // Shaders and framebuffers will be recreated on demand
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
   * Initialize fullscreen quad vertex buffer
   */
  private initQuadBuffer(): void {
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ])

    this.quadBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW)
  }

  /**
   * Compile a shader program
   */
  compileShader(
    fragmentSource: string,
    vertexSource: string = DEFAULT_VERTEX_SHADER,
    isShadertoy: boolean = false
  ): CompiledShader | { error: string } {
    const gl = this.gl

    // Wrap Shadertoy shaders
    let finalFragmentSource = fragmentSource
    if (isShadertoy) {
      finalFragmentSource = SHADERTOY_WRAPPER_PREFIX + fragmentSource + SHADERTOY_WRAPPER_SUFFIX
    }

    // Check cache
    const cacheKey = vertexSource + '|||' + finalFragmentSource
    const cached = this.shaderCache.get(cacheKey)
    if (cached) return cached

    // Compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vertexShader, vertexSource)
    gl.compileShader(vertexShader)

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vertexShader) ?? 'Unknown vertex shader error'
      gl.deleteShader(vertexShader)
      return { error: `Vertex shader: ${error}` }
    }

    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fragmentShader, finalFragmentSource)
    gl.compileShader(fragmentShader)

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fragmentShader) ?? 'Unknown fragment shader error'
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return { error: `Fragment shader: ${error}` }
    }

    // Link program
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) ?? 'Unknown linking error'
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return { error: `Linking: ${error}` }
    }

    // Clean up shaders (attached to program, no longer needed)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    // Get uniform locations
    const uniforms = new Map<string, WebGLUniformLocation>()
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i)
      if (info) {
        const location = gl.getUniformLocation(program, info.name)
        if (location) {
          uniforms.set(info.name, location)
        }
      }
    }

    // Get attribute locations
    const attributes = new Map<string, number>()
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES)
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i)
      if (info) {
        attributes.set(info.name, gl.getAttribLocation(program, info.name))
      }
    }

    const compiled: CompiledShader = { program, uniforms, attributes }
    this.shaderCache.set(cacheKey, compiled)
    return compiled
  }

  /**
   * Render a shader to the canvas or a framebuffer
   */
  render(
    shader: CompiledShader,
    uniforms: ShaderUniform[] = [],
    targetFramebuffer?: string
  ): void {
    const gl = this.gl

    // Bind framebuffer if specified
    if (targetFramebuffer) {
      const fb = this.getOrCreateFramebuffer(targetFramebuffer)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    // Set viewport
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Use program
    gl.useProgram(shader.program)

    // Bind quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    const positionLoc = shader.attributes.get('a_position') ?? 0
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    // Set built-in uniforms
    this.setUniform(shader, 'u_time', this._time)
    this.setUniform(shader, 'u_resolution', [this.canvas.width, this.canvas.height])
    this.setUniform(shader, 'iTime', this._time)
    this.setUniform(shader, 'iResolution', [this.canvas.width, this.canvas.height])
    this.setUniform(shader, 'iMouse', [this._mouseX, this._mouseY, this._mouseDown ? 1 : 0, 0])
    this.setUniform(shader, 'iFrame', this._frame)

    // Set user uniforms
    let textureUnit = 0
    for (const uniform of uniforms) {
      if (uniform.type === 'sampler2D' && uniform.value instanceof WebGLTexture) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit)
        gl.bindTexture(gl.TEXTURE_2D, uniform.value)
        const loc = shader.uniforms.get(uniform.name)
        if (loc) gl.uniform1i(loc, textureUnit)
        textureUnit++
      } else {
        this.setUniform(shader, uniform.name, uniform.value as number | number[])
      }
    }

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    this._frame++
  }

  /**
   * Set a uniform value
   */
  private setUniform(shader: CompiledShader, name: string, value: number | number[]): void {
    const gl = this.gl
    const location = shader.uniforms.get(name)
    if (!location) return

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        gl.uniform1i(location, value)
      } else {
        gl.uniform1f(location, value)
      }
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2:
          gl.uniform2f(location, value[0], value[1])
          break
        case 3:
          gl.uniform3f(location, value[0], value[1], value[2])
          break
        case 4:
          gl.uniform4f(location, value[0], value[1], value[2], value[3])
          break
      }
    }
  }

  /**
   * Get or create a framebuffer for offscreen rendering
   */
  private getOrCreateFramebuffer(id: string): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
    let fb = this.framebuffers.get(id)
    if (fb) return fb

    const gl = this.gl

    // Create texture
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.canvas.width, this.canvas.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Create framebuffer
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

    fb = { fbo, texture }
    this.framebuffers.set(id, fb)
    return fb
  }

  /**
   * Create a texture from an image/video/canvas
   */
  createTexture(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): WebGLTexture {
    const gl = this.gl
    const texture = gl.createTexture()!

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    return texture
  }

  /**
   * Update a texture from a video or canvas (for real-time updates)
   */
  updateTexture(texture: WebGLTexture, source: HTMLVideoElement | HTMLCanvasElement): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  /**
   * Get framebuffer texture for use as input
   */
  getFramebufferTexture(id: string): WebGLTexture | null {
    return this.framebuffers.get(id)?.texture ?? null
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
   * Resize the canvas
   */
  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height

    // Delete and recreate framebuffers at new size
    // Must properly release GPU resources before clearing the Map
    // Delete texture before framebuffer (correct order for WebGL cleanup)
    const gl = this.gl
    for (const fb of this.framebuffers.values()) {
      gl.deleteTexture(fb.texture)
      gl.deleteFramebuffer(fb.fbo)
    }
    this.framebuffers.clear()
  }

  /**
   * Delete a specific framebuffer by ID (for node cleanup)
   */
  deleteFramebuffer(id: string): void {
    const fb = this.framebuffers.get(id)
    if (fb) {
      const gl = this.gl
      // Delete texture before framebuffer (correct order for WebGL cleanup)
      gl.deleteTexture(fb.texture)
      gl.deleteFramebuffer(fb.fbo)
      this.framebuffers.delete(id)
    }
  }

  /**
   * Delete a texture from GPU memory
   */
  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture)
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /**
   * Get canvas as data URL
   */
  toDataURL(): string {
    return this.canvas.toDataURL('image/png')
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    const gl = this.gl

    // Remove context loss event listeners
    if (this._boundContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this._boundContextLost)
    }
    if (this._boundContextRestored) {
      this.canvas.removeEventListener('webglcontextrestored', this._boundContextRestored)
    }

    // Delete shaders
    for (const shader of this.shaderCache.values()) {
      gl.deleteProgram(shader.program)
    }
    this.shaderCache.clear()

    // Delete framebuffers (texture before framebuffer for correct WebGL cleanup)
    for (const fb of this.framebuffers.values()) {
      gl.deleteTexture(fb.texture)
      gl.deleteFramebuffer(fb.fbo)
    }
    this.framebuffers.clear()

    // Delete quad buffer
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer)
    }
  }
}

// Singleton for shared rendering
let sharedRenderer: ShaderRenderer | null = null

/**
 * Check if the shared renderer has been initialized
 * Use this to avoid creating the renderer just for cleanup
 */
export function hasShaderRenderer(): boolean {
  return sharedRenderer !== null
}

export function getShaderRenderer(): ShaderRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new ShaderRenderer()
  }
  return sharedRenderer
}

export function disposeShaderRenderer(): void {
  if (sharedRenderer) {
    sharedRenderer.dispose()
    sharedRenderer = null
  }
}
