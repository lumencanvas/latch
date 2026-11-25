import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeObjects, primitiveDefaultMaterials, primitiveGeoKeys } from '../shared'

/**
 * Instances 3D: one shape drawn hundreds of times in a single draw call (THREE.InstancedMesh).
 * Copies are placed by a layout (grid, ring, spiral, line, random) or by a Positions list, and a
 * Values list can drive each copy's height or size and colour, so a spectrum becomes a city, a
 * point stream becomes an asteroid field, a data array becomes a 3D bar chart.
 */
const SHAPES = ['box', 'sphere', 'cone', 'cylinder', 'octahedron', 'tetrahedron', 'torus'] as const

const definition: NodeDefinition = {
  id: 'instances-3d',
  name: 'Instances 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Draw one shape hundreds of times: grid, ring, spiral or your own positions, with heights and colours from data',
  icon: 'boxes',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'positions', type: 'data', label: 'Positions' },
    { id: 'values', type: 'data', label: 'Values (0–1)' },
    { id: 'material', type: 'material3d', label: 'Material' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'spin', type: 'number', label: 'Spin' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [
    { id: 'shape', type: 'select', label: 'Shape', default: 'box', props: { options: [...SHAPES] } },
    {
      id: 'layout', type: 'select', label: 'Layout', default: 'grid',
      props: { options: [
        { value: 'grid', label: 'Grid (floor)' },
        { value: 'ring', label: 'Ring' },
        { value: 'spiral', label: 'Spiral (sunflower)' },
        { value: 'line', label: 'Line' },
        { value: 'random', label: 'Random cloud' },
      ] },
      description: 'Used when Positions is not wired.',
    },
    { id: 'count', type: 'number', label: 'Count', default: 64, props: { min: 1, max: 5000, step: 1 } },
    { id: 'spacing', type: 'number', label: 'Spacing', default: 1.2, props: { min: 0.05, max: 20, step: 0.05 } },
    { id: 'size', type: 'number', label: 'Size', default: 0.8, props: { min: 0.01, max: 20, step: 0.01 } },
    {
      id: 'valueMode', type: 'select', label: 'Values Drive', default: 'height',
      props: { options: [
        { value: 'height', label: 'Height (bars stand on the floor)' },
        { value: 'scale', label: 'Size' },
        { value: 'none', label: 'Colour only' },
      ] },
    },
    { id: 'valueScale', type: 'number', label: 'Value Scale', default: 4, props: { min: 0, max: 50, step: 0.1 } },
    { id: 'color', type: 'color', label: 'Color (low)', default: '#3a7bff' },
    { id: 'color2', type: 'color', label: 'Color (high)', default: '#ff3df0' },
    { id: 'emissive', type: 'slider', label: 'Glow', default: 0.25, props: { min: 0, max: 2, step: 0.05 } },
    { id: 'seed', type: 'number', label: 'Random Seed', default: 1, props: { min: 0, max: 9999, step: 1 } },
  ],
  info: {
    overview:
      'Draws one shape many times, fast (a single GPU draw call however many copies). Without inputs it lays out Count copies as a grid, ring, spiral, line or random cloud. Wire a Positions list (from Point Stream 3D, or any array of {x, y, z} / [x, y, z], optionally with s for size) to place them yourself. Wire a Values list (numbers 0–1, like Audio Analyzer’s Spectrum) to drive each copy’s height or size and blend its colour from low to high.',
    tips: [
      'Audio Analyzer → Spectrum into Values with the Grid or Ring layout makes a sound-reactive city.',
      'Point Stream 3D → Positions with the Octahedron shape makes an asteroid field.',
      'Wire it straight into Scene 3D (not through a Group: a group copies objects once and would freeze the instances).',
      'Spin rotates every copy in place (radians); wire Time into it.',
    ],
    pairsWith: ['point-stream-3d', 'audio-analyzer', 'scene-3d', 'material-3d', 'collide-3d'],
  },
  tags: ['instances', 'instancing', 'many', 'copies', 'grid', 'particles', 'city', 'bars', 'scatter', '3d'],
}

interface Pos { x: number; y: number; z: number; s?: number }

/** Accepts [{x,y,z,s?}] or [[x,y,z,s?]]; drops anything else. */
export function readPositions(v: unknown): Pos[] | null {
  if (!Array.isArray(v)) return null
  const out: Pos[] = []
  for (const p of v) {
    if (Array.isArray(p) && p.length >= 2) out.push({ x: +p[0] || 0, y: +p[1] || 0, z: +(p[2] ?? 0) || 0, s: p[3] === undefined ? undefined : +p[3] })
    else if (p && typeof p === 'object' && typeof (p as Pos).x === 'number') {
      const q = p as Pos
      out.push({ x: q.x, y: +q.y || 0, z: +q.z || 0, s: typeof q.s === 'number' ? q.s : undefined })
    }
  }
  return out
}

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Layout positions for n copies. Pure (tested). */
export function layoutPositions(layout: string, n: number, spacing: number, seed = 1): Pos[] {
  const out: Pos[] = []
  if (layout === 'ring') {
    const r = Math.max(spacing, (spacing * n) / (2 * Math.PI))
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }) }
  } else if (layout === 'spiral') {
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < n; i++) { const r = spacing * 0.5 * Math.sqrt(i + 0.5); const a = i * golden; out.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }) }
  } else if (layout === 'line') {
    for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * spacing, y: 0, z: 0 })
  } else if (layout === 'random') {
    const r = rng(seed)
    const half = (spacing * Math.cbrt(n)) / 2
    for (let i = 0; i < n; i++) out.push({ x: (r() * 2 - 1) * half, y: (r() * 2 - 1) * half, z: (r() * 2 - 1) * half })
  } else {
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    for (let i = 0; i < n; i++) out.push({ x: ((i % cols) - (cols - 1) / 2) * spacing, y: 0, z: (Math.floor(i / cols) - (rows - 1) / 2) * spacing })
  }
  return out
}

function makeGeometry(shape: string): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(0.5, 16, 12)
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 16)
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
    case 'octahedron': return new THREE.OctahedronGeometry(0.6)
    case 'tetrahedron': return new THREE.TetrahedronGeometry(0.65)
    case 'torus': return new THREE.TorusGeometry(0.4, 0.15, 10, 24)
    default: return new THREE.BoxGeometry(1, 1, 1)
  }
}

/** Blend two colours by hue the short way round (an RGB blend between far-apart colours goes grey). */
const hA = { h: 0, s: 0, l: 0 }
const hB = { h: 0, s: 0, l: 0 }
export function blendHue(a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color): THREE.Color {
  a.getHSL(hA); b.getHSL(hB)
  let dh = hB.h - hA.h
  if (dh > 0.5) dh -= 1
  else if (dh < -0.5) dh += 1
  const h = (((hA.h + dh * t) % 1) + 1) % 1
  return out.setHSL(h, hA.s + (hB.s - hA.s) * t, hA.l + (hB.l - hA.l) * t)
}

const dummy = new THREE.Object3D()
const colA = new THREE.Color()
const colB = new THREE.Color()
const tmp = new THREE.Color()

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const shape = ctx.str('shape', 'box')
  const positionsIn = readPositions(ctx.inputs.get('positions'))
  const valuesRaw = ctx.inputs.get('values')
  const values = Array.isArray(valuesRaw) ? (valuesRaw as unknown[]).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)) : null
  const spacing = ctx.num('spacing', 1.2)
  const n = Math.max(0, Math.min(5000, Math.round(positionsIn?.length ?? values?.length ?? ctx.num('count', 64))))
  const positions = positionsIn ?? layoutPositions(ctx.str('layout', 'grid'), n, spacing, ctx.num('seed', 1))

  // Default material, recoloured in place
  let mat = primitiveDefaultMaterials.get(ctx.nodeId) as THREE.MeshStandardMaterial | undefined
  if (!mat) {
    mat = getThreeRenderer().createMaterial({ color: 0xffffff }) as THREE.MeshStandardMaterial
    // Glow takes each copy's own colour: the emissive term is multiplied by the instance colour
    // (a shared emissive colour washed every copy toward the same tint). three.js defines USE_COLOR
    // in the fragment shader for instance colours.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 totalEmissiveRadiance = emissive;',
        '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n  vec3 totalEmissiveRadiance = emissive * vColor.rgb;\n#else\n  vec3 totalEmissiveRadiance = emissive;\n#endif',
      )
    }
    mat.customProgramCacheKey = () => 'latch-instance-glow'
    primitiveDefaultMaterials.set(ctx.nodeId, mat)
  }
  const matIn = ctx.inputs.get('material')
  const material = matIn instanceof THREE.Material ? matIn : mat

  // (Re)allocate when the shape changes or capacity runs out (capacity grows in steps, never per frame)
  let mesh = nodeObjects.get(ctx.nodeId) as THREE.InstancedMesh | undefined
  const geoKey = shape
  if (!(mesh instanceof THREE.InstancedMesh) || mesh.instanceMatrix.count < n || primitiveGeoKeys.get(ctx.nodeId) !== geoKey) {
    const capacity = Math.max(16, Math.ceil(Math.max(n, 1) / 64) * 64)
    const geometry = mesh instanceof THREE.InstancedMesh && primitiveGeoKeys.get(ctx.nodeId) === geoKey ? mesh.geometry : makeGeometry(shape)
    const parent = mesh?.parent ?? null
    if (mesh) {
      parent?.remove(mesh)
      if (mesh.geometry !== geometry) mesh.geometry.dispose()
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose()
    }
    mesh = new THREE.InstancedMesh(geometry, material, capacity)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    nodeObjects.set(ctx.nodeId, mesh)
    primitiveGeoKeys.set(ctx.nodeId, geoKey)
    parent?.add(mesh)
  }
  if (mesh.material !== material) mesh.material = material

  const size = ctx.num('size', 0.8)
  const mode = ctx.str('valueMode', 'height')
  const vScale = ctx.num('valueScale', 4)
  const spin = ctx.num('spin', 0)
  colA.set(ctx.str('color', '#3a7bff'))
  colB.set(ctx.str('color2', '#ff3df0'))
  // Glow: each copy emits its own colour (see onBeforeCompile)
  if (mat.emissive) { mat.emissive.set(0xffffff); mat.emissiveIntensity = ctx.num('emissive', 0.25) * 0.5 }

  for (let i = 0; i < n; i++) {
    const p = positions[i] ?? { x: 0, y: 0, z: 0 }
    const v = values ? Math.max(0, values[i] ?? 0) : 0
    const s = size * (p.s ?? 1)
    dummy.position.set(p.x, p.y, p.z)
    dummy.rotation.set(spin ? spin * 0.7 + i : 0, spin ? spin + i * 0.37 : 0, 0)
    if (values && mode === 'height') {
      const h = s * (0.05 + v * vScale)
      dummy.scale.set(s, h, s)
      dummy.position.y = p.y + h / 2
    } else if (values && mode === 'scale') {
      dummy.scale.setScalar(s * (0.2 + v * vScale * 0.25))
    } else {
      dummy.scale.setScalar(s)
    }
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    blendHue(colA, colB, values ? Math.min(1, v) : positions.length > 1 ? i / (positions.length - 1) : 0, tmp)
    mesh.setColorAt(i, tmp)
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  return new Map<string, unknown>([['object', mesh], ['count', n]])
}

export default defineNode({ definition, executor })
