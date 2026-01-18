/**
 * Three.js Renderer Service
 *
 * Manages 3D rendering for the node graph:
 * - WebGLRenderer with render targets
 * - Scene and camera pools per node
 * - Disposal management
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface ThreeRenderOutput {
  texture: WebGLTexture
  depthTexture?: WebGLTexture
}

export interface SceneData {
  scene: THREE.Scene
  objects: Map<string, THREE.Object3D>
}

export interface CameraData {
  camera: THREE.Camera
  type: 'perspective' | 'orthographic'
}

export class ThreeRenderer {
  private renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement
  private renderTargets: Map<string, THREE.WebGLRenderTarget> = new Map()
  private scenes: Map<string, SceneData> = new Map()
  private cameras: Map<string, CameraData> = new Map()
  private gltfLoader: GLTFLoader
  private defaultSize = { width: 512, height: 512 }

  constructor() {
    // Create a dedicated canvas for Three.js
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.defaultSize.width
    this.canvas.height = this.defaultSize.height

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })

    this.renderer.setSize(this.defaultSize.width, this.defaultSize.height)
    this.renderer.setPixelRatio(1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // Initialize GLTF loader
    this.gltfLoader = new GLTFLoader()
  }

  /**
   * Get or create a scene for a node
   */
  getOrCreateScene(nodeId: string): SceneData {
    let sceneData = this.scenes.get(nodeId)
    if (!sceneData) {
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x000000)
      sceneData = { scene, objects: new Map() }
      this.scenes.set(nodeId, sceneData)
    }
    return sceneData
  }

  /**
   * Get a scene by node ID
   */
  getScene(nodeId: string): SceneData | undefined {
    return this.scenes.get(nodeId)
  }

  /**
   * Clear a scene's objects
   */
  clearScene(nodeId: string): void {
    const sceneData = this.scenes.get(nodeId)
    if (sceneData) {
      // Remove all objects except lights and helpers
      while (sceneData.scene.children.length > 0) {
        const obj = sceneData.scene.children[0]
        sceneData.scene.remove(obj)
        this.disposeObject(obj)
      }
      sceneData.objects.clear()
    }
  }

  /**
   * Add an object to a scene
   */
  addToScene(sceneNodeId: string, object: THREE.Object3D, objectId?: string): void {
    const sceneData = this.getOrCreateScene(sceneNodeId)
    sceneData.scene.add(object)
    if (objectId) {
      sceneData.objects.set(objectId, object)
    }
  }

  /**
   * Get or create a camera for a node
   */
  getOrCreateCamera(
    nodeId: string,
    type: 'perspective' | 'orthographic' = 'perspective',
    options: {
      fov?: number
      near?: number
      far?: number
      position?: [number, number, number]
      target?: [number, number, number]
      orthoSize?: number
    } = {}
  ): THREE.Camera {
    const existing = this.cameras.get(nodeId)

    if (existing && existing.type === type) {
      // Update camera properties
      this.updateCamera(existing.camera, type, options)
      return existing.camera
    }

    // Create new camera
    let camera: THREE.Camera

    const aspect = this.defaultSize.width / this.defaultSize.height

    if (type === 'perspective') {
      camera = new THREE.PerspectiveCamera(
        options.fov ?? 50,
        aspect,
        options.near ?? 0.1,
        options.far ?? 1000
      )
    } else {
      const size = options.orthoSize ?? 5
      camera = new THREE.OrthographicCamera(
        -size * aspect,
        size * aspect,
        size,
        -size,
        options.near ?? 0.1,
        options.far ?? 1000
      )
    }

    // Set position and target
    const pos = options.position ?? [0, 2, 5]
    camera.position.set(pos[0], pos[1], pos[2])

    const target = options.target ?? [0, 0, 0]
    camera.lookAt(target[0], target[1], target[2])

    this.cameras.set(nodeId, { camera, type })
    return camera
  }

  /**
   * Update camera properties
   */
  private updateCamera(
    camera: THREE.Camera,
    type: 'perspective' | 'orthographic',
    options: {
      fov?: number
      near?: number
      far?: number
      position?: [number, number, number]
      target?: [number, number, number]
      orthoSize?: number
    }
  ): void {
    if (type === 'perspective' && camera instanceof THREE.PerspectiveCamera) {
      if (options.fov !== undefined) camera.fov = options.fov
      if (options.near !== undefined) camera.near = options.near
      if (options.far !== undefined) camera.far = options.far
      camera.updateProjectionMatrix()
    } else if (type === 'orthographic' && camera instanceof THREE.OrthographicCamera) {
      if (options.orthoSize !== undefined) {
        const aspect = this.defaultSize.width / this.defaultSize.height
        camera.left = -options.orthoSize * aspect
        camera.right = options.orthoSize * aspect
        camera.top = options.orthoSize
        camera.bottom = -options.orthoSize
      }
      if (options.near !== undefined) camera.near = options.near
      if (options.far !== undefined) camera.far = options.far
      camera.updateProjectionMatrix()
    }

    if (options.position) {
      camera.position.set(options.position[0], options.position[1], options.position[2])
    }
    if (options.target) {
      camera.lookAt(options.target[0], options.target[1], options.target[2])
    }
  }

  /**
   * Get or create a render target for a node
   */
  getOrCreateRenderTarget(
    nodeId: string,
    width: number = this.defaultSize.width,
    height: number = this.defaultSize.height,
    includeDepth: boolean = false
  ): THREE.WebGLRenderTarget {
    const key = `${nodeId}_${width}_${height}_${includeDepth}`
    let target = this.renderTargets.get(key)

    if (!target) {
      const options: THREE.RenderTargetOptions = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      }

      if (includeDepth) {
        options.depthBuffer = true
        options.depthTexture = new THREE.DepthTexture(width, height)
        options.depthTexture.format = THREE.DepthFormat
        options.depthTexture.type = THREE.UnsignedIntType
      }

      target = new THREE.WebGLRenderTarget(width, height, options)
      this.renderTargets.set(key, target)
    }

    return target
  }

  /**
   * Render a scene to a render target
   */
  render(
    scene: THREE.Scene,
    camera: THREE.Camera,
    nodeId: string,
    width: number = this.defaultSize.width,
    height: number = this.defaultSize.height,
    includeDepth: boolean = false
  ): ThreeRenderOutput {
    const target = this.getOrCreateRenderTarget(nodeId, width, height, includeDepth)

    // Resize renderer if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.renderer.setSize(width, height)
    }

    // Render to target
    this.renderer.setRenderTarget(target)
    this.renderer.render(scene, camera)
    this.renderer.setRenderTarget(null)

    // Get the raw WebGL texture
    const textureProperties = this.renderer.properties.get(target.texture)
    const webglTexture = textureProperties.__webglTexture as WebGLTexture

    const output: ThreeRenderOutput = {
      texture: webglTexture,
    }

    if (includeDepth && target.depthTexture) {
      const depthProperties = this.renderer.properties.get(target.depthTexture)
      output.depthTexture = depthProperties.__webglTexture as WebGLTexture
    }

    return output
  }

  /**
   * Render a scene directly to the canvas (for sharing with other renderers)
   */
  renderToCanvas(
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number = this.defaultSize.width,
    height: number = this.defaultSize.height
  ): void {
    // Resize canvas and renderer if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.renderer.setSize(width, height)
    }

    // Render directly to canvas (no render target)
    this.renderer.setRenderTarget(null)
    this.renderer.render(scene, camera)
  }

  /**
   * Create a Box geometry mesh
   */
  createBox(
    width: number = 1,
    height: number = 1,
    depth: number = 1,
    material?: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0x808080 })
    return new THREE.Mesh(geometry, mat)
  }

  /**
   * Create a Sphere geometry mesh
   */
  createSphere(
    radius: number = 0.5,
    widthSegments: number = 32,
    heightSegments: number = 16,
    material?: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments)
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0x808080 })
    return new THREE.Mesh(geometry, mat)
  }

  /**
   * Create a Plane geometry mesh
   */
  createPlane(
    width: number = 1,
    height: number = 1,
    widthSegments: number = 1,
    heightSegments: number = 1,
    material?: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments)
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide })
    return new THREE.Mesh(geometry, mat)
  }

  /**
   * Create a Cylinder geometry mesh
   */
  createCylinder(
    radiusTop: number = 0.5,
    radiusBottom: number = 0.5,
    height: number = 1,
    radialSegments: number = 32,
    material?: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0x808080 })
    return new THREE.Mesh(geometry, mat)
  }

  /**
   * Create a Torus geometry mesh
   */
  createTorus(
    radius: number = 0.5,
    tube: number = 0.2,
    radialSegments: number = 16,
    tubularSegments: number = 100,
    material?: THREE.Material
  ): THREE.Mesh {
    const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0x808080 })
    return new THREE.Mesh(geometry, mat)
  }

  /**
   * Create a material
   */
  createMaterial(options: {
    type?: 'standard' | 'basic' | 'phong' | 'physical'
    color?: number
    map?: THREE.Texture
    normalMap?: THREE.Texture
    roughnessMap?: THREE.Texture
    metalnessMap?: THREE.Texture
    metalness?: number
    roughness?: number
    opacity?: number
    transparent?: boolean
    wireframe?: boolean
    emissive?: number
    emissiveIntensity?: number
    side?: 'front' | 'back' | 'double'
  } = {}): THREE.Material {
    const baseOptions: THREE.MeshStandardMaterialParameters = {
      color: options.color ?? 0x808080,
      metalness: options.metalness ?? 0,
      roughness: options.roughness ?? 0.5,
      opacity: options.opacity ?? 1,
      transparent: options.transparent ?? (options.opacity !== undefined && options.opacity < 1),
      wireframe: options.wireframe ?? false,
      side: options.side === 'back' ? THREE.BackSide
        : options.side === 'double' ? THREE.DoubleSide
        : THREE.FrontSide,
    }

    if (options.map) baseOptions.map = options.map
    if (options.normalMap) baseOptions.normalMap = options.normalMap
    if (options.roughnessMap) baseOptions.roughnessMap = options.roughnessMap
    if (options.metalnessMap) baseOptions.metalnessMap = options.metalnessMap
    if (options.emissive !== undefined) baseOptions.emissive = new THREE.Color(options.emissive)
    if (options.emissiveIntensity !== undefined) baseOptions.emissiveIntensity = options.emissiveIntensity

    switch (options.type) {
      case 'basic':
        return new THREE.MeshBasicMaterial({
          color: baseOptions.color,
          opacity: baseOptions.opacity,
          transparent: baseOptions.transparent,
          wireframe: baseOptions.wireframe,
          side: baseOptions.side,
          map: baseOptions.map,
        })
      case 'phong':
        return new THREE.MeshPhongMaterial({
          color: baseOptions.color,
          opacity: baseOptions.opacity,
          transparent: baseOptions.transparent,
          wireframe: baseOptions.wireframe,
          side: baseOptions.side,
          map: baseOptions.map,
          normalMap: baseOptions.normalMap,
        })
      case 'physical':
        return new THREE.MeshPhysicalMaterial(baseOptions)
      case 'standard':
      default:
        return new THREE.MeshStandardMaterial(baseOptions)
    }
  }

  /**
   * Create an ambient light
   */
  createAmbientLight(color: number = 0xffffff, intensity: number = 0.5): THREE.AmbientLight {
    return new THREE.AmbientLight(color, intensity)
  }

  /**
   * Create a directional light
   */
  createDirectionalLight(
    color: number = 0xffffff,
    intensity: number = 1,
    position: [number, number, number] = [5, 5, 5],
    castShadow: boolean = true
  ): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.set(position[0], position[1], position[2])

    if (castShadow) {
      light.castShadow = true
      light.shadow.mapSize.width = 1024
      light.shadow.mapSize.height = 1024
      light.shadow.camera.near = 0.5
      light.shadow.camera.far = 50
      light.shadow.camera.left = -10
      light.shadow.camera.right = 10
      light.shadow.camera.top = 10
      light.shadow.camera.bottom = -10
    }

    return light
  }

  /**
   * Create a point light
   */
  createPointLight(
    color: number = 0xffffff,
    intensity: number = 1,
    distance: number = 0,
    decay: number = 2,
    position: [number, number, number] = [0, 2, 0],
    castShadow: boolean = false
  ): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, decay)
    light.position.set(position[0], position[1], position[2])

    if (castShadow) {
      light.castShadow = true
      light.shadow.mapSize.width = 512
      light.shadow.mapSize.height = 512
    }

    return light
  }

  /**
   * Create a spot light
   */
  createSpotLight(
    color: number = 0xffffff,
    intensity: number = 1,
    distance: number = 0,
    angle: number = Math.PI / 6,
    penumbra: number = 0.1,
    decay: number = 2,
    position: [number, number, number] = [0, 5, 0],
    target: [number, number, number] = [0, 0, 0],
    castShadow: boolean = true
  ): THREE.SpotLight {
    const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay)
    light.position.set(position[0], position[1], position[2])
    light.target.position.set(target[0], target[1], target[2])

    if (castShadow) {
      light.castShadow = true
      light.shadow.mapSize.width = 1024
      light.shadow.mapSize.height = 1024
    }

    return light
  }

  /**
   * Load a GLTF model
   */
  async loadGLTF(url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          // Enable shadows on all meshes
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })
          resolve(gltf.scene)
        },
        undefined,
        (error) => reject(error)
      )
    })
  }

  /**
   * Create a Group for combining objects
   */
  createGroup(): THREE.Group {
    return new THREE.Group()
  }

  /**
   * Apply transform to an object
   */
  applyTransform(
    object: THREE.Object3D,
    position?: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number]
  ): THREE.Object3D {
    if (position) {
      object.position.set(position[0], position[1], position[2])
    }
    if (rotation) {
      object.rotation.set(
        THREE.MathUtils.degToRad(rotation[0]),
        THREE.MathUtils.degToRad(rotation[1]),
        THREE.MathUtils.degToRad(rotation[2])
      )
    }
    if (scale) {
      object.scale.set(scale[0], scale[1], scale[2])
    }
    return object
  }

  /**
   * Create a texture from a WebGL texture
   */
  createTextureFromWebGL(webglTexture: WebGLTexture, width: number, height: number): THREE.Texture {
    const gl = this.renderer.getContext()

    // We need to use the raw texture via DataTexture workaround
    // Create a framebuffer to read the texture
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, webglTexture, 0)

    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)

    // Create DataTexture from pixels
    const dataTexture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
    dataTexture.needsUpdate = true

    return dataTexture
  }

  /**
   * Dispose an object and its resources
   */
  private disposeObject(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach((m) => m.dispose())
      } else if (object.material) {
        object.material.dispose()
      }
    }
    object.children.forEach((child) => this.disposeObject(child))
  }

  /**
   * Dispose resources for a specific node
   */
  disposeNode(nodeId: string): void {
    // Dispose scene
    const sceneData = this.scenes.get(nodeId)
    if (sceneData) {
      this.clearScene(nodeId)
      this.scenes.delete(nodeId)
    }

    // Dispose camera
    this.cameras.delete(nodeId)

    // Dispose render targets with this node ID
    for (const [key, target] of this.renderTargets) {
      if (key.startsWith(nodeId)) {
        target.dispose()
        this.renderTargets.delete(key)
      }
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Dispose all scenes
    for (const [nodeId] of this.scenes) {
      this.clearScene(nodeId)
    }
    this.scenes.clear()

    // Dispose all cameras
    this.cameras.clear()

    // Dispose all render targets
    for (const target of this.renderTargets.values()) {
      target.dispose()
    }
    this.renderTargets.clear()

    // Dispose renderer
    this.renderer.dispose()
  }

  /**
   * Get the WebGL context
   */
  getContext(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  /**
   * Set default render size
   */
  setDefaultSize(width: number, height: number): void {
    this.defaultSize = { width, height }
    this.renderer.setSize(width, height)
  }
}

// Singleton instance
let sharedThreeRenderer: ThreeRenderer | null = null

export function getThreeRenderer(): ThreeRenderer {
  if (!sharedThreeRenderer) {
    sharedThreeRenderer = new ThreeRenderer()
  }
  return sharedThreeRenderer
}

export function disposeThreeRenderer(): void {
  if (sharedThreeRenderer) {
    sharedThreeRenderer.dispose()
    sharedThreeRenderer = null
  }
}

// Re-export THREE for convenience
export { THREE }
