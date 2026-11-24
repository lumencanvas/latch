import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { makeContext } from '../_helpers/executionContext'

// happy-dom has no WebGL: stub the 3D renderer singleton with the pieces the executors use
// (real THREE objects, no GL context). peekThreeRenderer → null keeps GC from touching it.
const { stub } = vi.hoisted(() => ({ stub: {} as Record<string, unknown> }))

vi.mock('@/services/visual/ThreeRenderer', async () => {
  const T = await import('three')
  const scenes = new Map<string, { scene: THREE.Scene }>()
  Object.assign(stub, {
    scenes,
    createMaterial: (o: { color?: number; side?: string } = {}) =>
      new T.MeshStandardMaterial({ color: o.color ?? 0x808080, side: o.side === 'double' ? T.DoubleSide : T.FrontSide }),
    createAmbientLight: () => new T.AmbientLight(),
    createDirectionalLight: () => new T.DirectionalLight(),
    createPointLight: () => new T.PointLight(),
    createSpotLight: () => new T.SpotLight(),
    createGroup: () => new T.Group(),
    getOrCreateScene: (id: string) => {
      let s = scenes.get(id)
      if (!s) {
        s = { scene: new T.Scene() }
        scenes.set(id, s)
      }
      return s
    },
    loadGLTF: vi.fn(),
    disposeNode: vi.fn(),
  })
  return { THREE: T, getThreeRenderer: () => stub, peekThreeRenderer: () => null }
})
vi.mock('@/services/visual/ThreeShaderRenderer', () => ({ getThreeShaderRenderer: () => ({}) }))

import box from '@/registry/3d/box-3d/node'
import material3d from '@/registry/3d/material-3d/node'
import spot from '@/registry/3d/spot-light-3d/node'
import directional from '@/registry/3d/directional-light-3d/node'
import group from '@/registry/3d/group-3d/node'
import scene3d from '@/registry/3d/scene-3d/node'
import gltf from '@/registry/3d/gltf-loader/node'
import { dispose3DNode, disposeAll3DNodes, nodeObjects } from '@/registry/3d/shared'

const run = (node: { executor: (c: ReturnType<typeof makeContext>) => unknown }, id: string, inputs = {}, controls = {}) =>
  node.executor(makeContext(inputs, controls, { nodeId: id })) as Map<string, unknown>

beforeEach(() => {
  disposeAll3DNodes()
})

describe('primitive meshes (box-3d)', () => {
  it('rebuilds geometry only when its params change', () => {
    const m1 = run(box, 'b1', {}, { width: 1 }).get('object') as THREE.Mesh
    const g1 = m1.geometry
    const dispose = vi.spyOn(g1, 'dispose')
    const m2 = run(box, 'b1', {}, { width: 1 }).get('object') as THREE.Mesh
    expect(m2).toBe(m1)
    expect(m2.geometry).toBe(g1)
    expect(dispose).not.toHaveBeenCalled()
    run(box, 'b1', {}, { width: 2 })
    expect(m1.geometry).not.toBe(g1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('applies a changed Color control and reverts to the default material when unwired', () => {
    const mesh = run(box, 'b2', {}, { color: '#ff0000' }).get('object') as THREE.Mesh
    const def = mesh.material as THREE.MeshStandardMaterial
    expect(def.color.getHexString()).toBe('ff0000')
    run(box, 'b2', {}, { color: '#00ff00' })
    expect(def.color.getHexString()).toBe('00ff00')

    const wired = new THREE.MeshBasicMaterial()
    run(box, 'b2', { material: wired })
    expect(mesh.material).toBe(wired)
    run(box, 'b2', {})
    expect(mesh.material).toBe(def)
  })

  it('deleting the mesh never disposes a wired (Material 3D-owned) material', () => {
    const wired = new THREE.MeshBasicMaterial()
    const spy = vi.spyOn(wired, 'dispose')
    run(box, 'b3', { material: wired })
    dispose3DNode('b3')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('material-3d', () => {
  it('reuses one material across frames and updates it in place', () => {
    const a = run(material3d, 'm1', {}, { roughness: 0.2 }).get('material') as THREE.MeshStandardMaterial
    const spy = vi.spyOn(a, 'dispose')
    const b = run(material3d, 'm1', {}, { roughness: 0.9, color: '#112233' }).get('material') as THREE.MeshStandardMaterial
    expect(b).toBe(a)
    expect(spy).not.toHaveBeenCalled()
    expect(a.roughness).toBe(0.9)
    expect(a.color.getHexString()).toBe('112233')
  })

  it('recreates (and disposes the old) only when the type changes', () => {
    const a = run(material3d, 'm2', {}, { type: 'standard' }).get('material') as THREE.Material
    const spy = vi.spyOn(a, 'dispose')
    const b = run(material3d, 'm2', {}, { type: 'basic' }).get('material') as THREE.Material
    expect(b).not.toBe(a)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('light nodes', () => {
  it('cache one light per node and update it in place', () => {
    const l1 = run(directional, 'd1', {}, { intensity: 1 }).get('light') as THREE.DirectionalLight
    const l2 = run(directional, 'd1', { intensity: 3 }, {}).get('light') as THREE.DirectionalLight
    expect(l2).toBe(l1)
    expect(l1.intensity).toBe(3)
  })

  it('spot light aims at its target (target matrixWorld refreshed) and disposes its shadow on delete', () => {
    const light = run(spot, 's1', {}, { targetX: 4, targetY: 0, targetZ: -2 }).get('light') as THREE.SpotLight
    const p = new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld)
    expect(p.toArray()).toEqual([4, 0, -2])
    const spy = vi.spyOn(light, 'dispose')
    dispose3DNode('s1')
    expect(spy).toHaveBeenCalled()
    expect(nodeObjects.has('s1')).toBe(false)
  })
})

describe('group-3d', () => {
  it('does not dispose the source material and keeps clones in sync with the source', () => {
    const src = run(box, 'gb', {}, { width: 1 }).get('object') as THREE.Mesh
    const matSpy = vi.spyOn(src.material as THREE.Material, 'dispose')
    const g = run(group, 'g1', { objects: [src] }).get('object') as THREE.Group
    expect(g.children).toHaveLength(1)
    // source changes geometry + moves
    run(box, 'gb', { posX: 3 }, { width: 2 })
    run(group, 'g1', { objects: [src] })
    const clone = g.children[0] as THREE.Mesh
    expect(clone.geometry).toBe(src.geometry)
    expect(clone.position.x).toBe(3)
    // input set changes → old clones dropped, source material untouched
    run(group, 'g1', { objects: [] })
    expect(g.children).toHaveLength(0)
    expect(matSpy).not.toHaveBeenCalled()
  })
})

describe('scene-3d', () => {
  it('attaches/detaches upstream objects without disposing them, and reuses its helpers', () => {
    const mesh = run(box, 'sb', {}).get('object') as THREE.Mesh
    const matSpy = vi.spyOn(mesh.material as THREE.Material, 'dispose')
    const geoSpy = vi.spyOn(mesh.geometry, 'dispose')
    const scene = run(scene3d, 'sc', { objects: [mesh] }).get('scene') as THREE.Scene
    const childCount = scene.children.length
    run(scene3d, 'sc', { objects: [mesh] })
    run(scene3d, 'sc', { objects: [mesh] })
    expect(scene.children.length).toBe(childCount) // no per-frame helper churn
    expect(mesh.parent).toBe(scene)
    expect(matSpy).not.toHaveBeenCalled()
    expect(geoSpy).not.toHaveBeenCalled()
    run(scene3d, 'sc', { objects: [] })
    expect(mesh.parent).toBeNull()
  })

  it('hides the fallback lights when a light is wired', () => {
    const light = run(directional, 'sl', {}).get('light') as THREE.Light
    const scene = run(scene3d, 'sc2', { objects: [light] }).get('scene') as THREE.Scene
    const fallback = scene.children.filter((c) => c instanceof THREE.Light && c !== light)
    expect(fallback.length).toBe(2)
    expect(fallback.every((l) => !l.visible)).toBe(true)
  })
})

describe('gltf-loader', () => {
  it('never blocks the frame: returns loading immediately and latches errors per URL', async () => {
    const loadGLTF = stub.loadGLTF as ReturnType<typeof vi.fn>
    loadGLTF.mockReset()
    loadGLTF.mockRejectedValue(new Error('404'))
    const out = run(gltf, 'gl1', {}, { url: 'a.glb' })
    expect(out).toBeInstanceOf(Map) // synchronous, not a Promise
    expect(out.get('loading')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    const out2 = run(gltf, 'gl1', {}, { url: 'a.glb' })
    expect(out2.get('error')).toBe('404')
    expect(out2.get('loading')).toBe(false)
    expect(loadGLTF).toHaveBeenCalledTimes(1) // not re-requested every frame
  })

  it('applies position/scale every frame once loaded', async () => {
    const loadGLTF = stub.loadGLTF as ReturnType<typeof vi.fn>
    const model = new THREE.Group()
    loadGLTF.mockReset()
    loadGLTF.mockResolvedValue(model)
    run(gltf, 'gl2', {}, { url: 'b.glb' })
    await new Promise((r) => setTimeout(r, 0))
    const obj = run(gltf, 'gl2', { posX: 5 }, { url: 'b.glb', scale: 2 }).get('object')
    expect(obj).toBe(model)
    expect(model.position.x).toBe(5)
    expect(model.scale.x).toBe(2)
  })
})
