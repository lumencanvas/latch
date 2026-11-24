import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { makeContext } from '../_helpers/executionContext'

// Stub the shader renderer singleton (no WebGL in happy-dom). Effect nodes only need
// createTexture/updateTexture/getEffectShader/compileEffectShader/render.
const { r } = vi.hoisted(() => ({ r: {} as Record<string, ReturnType<typeof import('vitest').vi.fn>> & { uniforms?: Record<string, { value: unknown }> } }))

vi.mock('@/services/visual/ThreeShaderRenderer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const T = await import('three')
  const uniforms: Record<string, { value: unknown }> = {}
  const vec2 = () => ({ value: new T.Vector2() })
  for (const n of ['u_texture', 'u_displacement', 'u_strength', 'u_channel', 'u_radius', 'u_direction',
    'u_brightness', 'u_contrast', 'u_saturation', 'u_hue', 'u_gamma']) uniforms[n] = { value: 0 }
  uniforms.u_resolution = vec2()
  Object.assign(r, {
    uniforms,
    createTexture: vi.fn((src: unknown) => new T.Texture(src as HTMLCanvasElement)),
    updateTexture: vi.fn(),
    createTextureFromWebGL: vi.fn((_t: unknown, w: number, h: number, reuse?: unknown) =>
      reuse ?? new T.DataTexture(new Uint8Array(w * h * 4), w, h)),
    getEffectShader: vi.fn(() => ({ material: {}, uniforms })),
    compileEffectShader: vi.fn(),
    render: vi.fn((_s: unknown, _u: unknown, id: string) => {
      const t = new T.Texture()
      t.name = id
      return t
    }),
  })
  return { ...actual, getThreeShaderRenderer: () => r }
})

import { resolveEffectSource, disposeEffectVideoState, effectCanvasTextures, effectWebGLTextures, disposeAllVisualNodes } from '@/registry/visual/shared'
import colorCorrection from '@/registry/visual/color-correction/node'
import blur from '@/registry/visual/blur/node'
import displacement from '@/registry/visual/displacement/node'
import { ThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { ThreeRenderer } from '@/services/visual/ThreeRenderer'

const run = (node: { executor: (c: ReturnType<typeof makeContext>) => unknown }, inputs = {}, controls = {}, id = 'n1') =>
  node.executor(makeContext(inputs, controls, { nodeId: id })) as Map<string, unknown>

beforeEach(() => {
  disposeAllVisualNodes()
  r.createTexture.mockClear()
  r.updateTexture.mockClear()
  r.createTextureFromWebGL.mockClear()
  r.render.mockClear()
})

describe('resolveEffectSource — canvas sources (D2)', () => {
  it('reuses one cached texture per node instead of creating one per frame', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    const a = resolveEffectSource('fx1', r as never, canvas)
    const b = resolveEffectSource('fx1', r as never, canvas)
    expect(r.createTexture).toHaveBeenCalledTimes(1)
    expect(r.updateTexture).toHaveBeenCalledTimes(1)
    expect(b?.tex).toBe(a?.tex)
    expect([b?.w, b?.h]).toEqual([64, 32])
  })

  it('disposes the cached texture (incl. `::slot` keys) with the node', () => {
    const canvas = document.createElement('canvas')
    const t = resolveEffectSource('fx2', r as never, canvas)!.tex
    const t2 = resolveEffectSource('fx2::disp', r as never, canvas)!.tex
    const s1 = vi.spyOn(t, 'dispose')
    const s2 = vi.spyOn(t2, 'dispose')
    disposeEffectVideoState('fx2')
    expect(s1).toHaveBeenCalled()
    expect(s2).toHaveBeenCalled()
    expect(effectCanvasTextures.size).toBe(0)
  })
})

describe('color-correction hue units', () => {
  const tex = new THREE.Texture()
  it('scales only the degree slider by 1/360', () => {
    run(colorCorrection, { texture: tex }, { hue: 90 })
    expect(r.uniforms!.u_hue.value).toBeCloseTo(0.25)
  })
  it('passes a wired hue input through in turns (LFO ±1 = ±1 turn)', () => {
    run(colorCorrection, { texture: tex, hue: 0.5 }, { hue: 90 })
    expect(r.uniforms!.u_hue.value).toBe(0.5)
  })
})

describe('blur passes', () => {
  it('runs `passes` H+V iterations (control was ignored)', () => {
    const tex = new THREE.Texture()
    run(blur, { texture: tex }, { radius: 2, passes: 3 })
    expect(r.render).toHaveBeenCalledTimes(6)
    run(blur, { texture: tex }, { radius: 2, passes: 1 })
    expect(r.render).toHaveBeenCalledTimes(8)
  })
})

describe('displacement channel', () => {
  it("'rgb' maps to its own shader mode instead of silently acting as 'rg'", () => {
    const tex = new THREE.Texture()
    run(displacement, { texture: tex, displacement: new THREE.Texture() }, { channel: 'rgb' })
    expect(r.uniforms!.u_channel.value).toBe(4)
    run(displacement, { texture: tex, displacement: new THREE.Texture() }, { channel: 'rg' })
    expect(r.uniforms!.u_channel.value).toBe(3)
  })
})

describe('render targets are freed on resize', () => {
  it('ThreeShaderRenderer drops the previous-size target for the same node only', () => {
    const self = { renderTargets: new Map(), renderTargetKeyByNode: new Map() }
    const get = (ThreeShaderRenderer.prototype as unknown as Record<string, (...a: unknown[]) => THREE.WebGLRenderTarget>)
      .getOrCreateRenderTarget
    const a = get.call(self, 'n', 256, 256)
    const h = get.call(self, 'n_h', 256, 256) // blur's H-pass target must survive
    const spy = vi.spyOn(a, 'dispose')
    const b = get.call(self, 'n', 512, 512)
    expect(b).not.toBe(a)
    expect(spy).toHaveBeenCalled()
    expect([...self.renderTargets.keys()].sort()).toEqual(['n_512_512', 'n_h_256_256'])
    expect(get.call(self, 'n_h', 256, 256)).toBe(h)
  })

  it('ThreeRenderer drops the previous-size target (and depth texture)', () => {
    const self = { renderTargets: new Map(), renderTargetKeyByNode: new Map(), defaultSize: { width: 512, height: 512 } }
    const get = (ThreeRenderer.prototype as unknown as Record<string, (...a: unknown[]) => THREE.WebGLRenderTarget>)
      .getOrCreateRenderTarget
    const a = get.call(self, 'r', 512, 512, true)
    const depthSpy = vi.spyOn(a.depthTexture!, 'dispose')
    get.call(self, 'r', 800, 600, true)
    expect(depthSpy).toHaveBeenCalled()
    expect([...self.renderTargets.keys()]).toEqual(['r_800_600_true'])
  })

  it('ThreeRenderer matches the camera aspect to the output size', () => {
    const applyAspect = (ThreeRenderer.prototype as unknown as Record<string, (...a: unknown[]) => void>).applyAspect
    const cam = new THREE.PerspectiveCamera(50, 1)
    applyAspect.call({}, cam, 1920, 1080)
    expect(cam.aspect).toBeCloseTo(1920 / 1080)
    const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5)
    ortho.userData.orthoSize = 5
    applyAspect.call({}, ortho, 200, 100)
    expect([ortho.left, ortho.right, ortho.top, ortho.bottom]).toEqual([-10, 10, 5, -5])
  })
})

import videoPlayer from '@/registry/visual/video-player/node'

describe('video-player triggers', () => {
  it('a held Play input calls play() once (rising edge), not every frame', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      return Promise.resolve()
    })
    for (let i = 0; i < 5; i++) run(videoPlayer, { play: true }, { url: 'clip.mp4' }, 'vp1')
    expect(play).toHaveBeenCalledTimes(1)
    run(videoPlayer, { play: false }, { url: 'clip.mp4' }, 'vp1')
    run(videoPlayer, { play: true }, { url: 'clip.mp4' }, 'vp1')
    expect(play).toHaveBeenCalledTimes(2)
    play.mockRestore()
  })
})

describe('resolveEffectSource — raw WebGLTexture sources', () => {
  class FakeWebGLTexture {}
  beforeEach(() => { vi.stubGlobal('WebGLTexture', FakeWebGLTexture) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('reuses one DataTexture per slot (re-read in place), disposing it on source change + node dispose', () => {
    const src = new FakeWebGLTexture()
    const a = resolveEffectSource('wg1', r as never, src)!.tex
    const b = resolveEffectSource('wg1', r as never, src)!.tex
    expect(b).toBe(a)
    expect(r.createTextureFromWebGL).toHaveBeenCalledTimes(2)
    expect(r.createTextureFromWebGL.mock.calls[1][3]).toBe(a) // second frame reads INTO the cached texture
    const spyA = vi.spyOn(a, 'dispose')
    const c = resolveEffectSource('wg1', r as never, new FakeWebGLTexture())!.tex
    expect(c).not.toBe(a)
    expect(spyA).toHaveBeenCalled()
    const spyC = vi.spyOn(c, 'dispose')
    disposeEffectVideoState('wg1')
    expect(spyC).toHaveBeenCalled()
    expect(effectWebGLTextures.size).toBe(0)
  })

  it('a foreign-context WebGLTexture yields null and warns once, not every frame', () => {
    r.createTextureFromWebGL.mockReturnValueOnce(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const src = new FakeWebGLTexture()
    expect(resolveEffectSource('wg2', r as never, src)).toBeNull()
    expect(resolveEffectSource('wg2', r as never, src)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(r.createTextureFromWebGL).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('ThreeShaderRenderer.renderToCanvas render-target fast path', () => {
  it('reads back a three r184 render-target texture (image is {width,height,depth}, not null)', () => {
    const target = new THREE.WebGLRenderTarget(2, 2)
    expect(target.texture.image).not.toBeNull() // the old null-check never matched
    const readRenderTargetPixels = vi.fn()
    const render = vi.fn()
    const self = {
      _contextLost: false,
      renderTargets: new Map([['k', target]]),
      previewReadbackAt: new Map(),
      readbackPixels: new Uint8Array(0),
      readbackFlipped: new Uint8ClampedArray(0),
      renderer: { readRenderTargetPixels, render, setRenderTarget: vi.fn(), setSize: vi.fn() },
    }
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const putImageData = vi.fn()
    vi.spyOn(canvas, 'getContext').mockReturnValue({ putImageData, drawImage: vi.fn() } as unknown as RenderingContext)
    ThreeShaderRenderer.prototype.renderToCanvas.call(self as never, target.texture, canvas)
    expect(readRenderTargetPixels).toHaveBeenCalledTimes(1)
    expect(putImageData).toHaveBeenCalledTimes(1)
    expect(render).not.toHaveBeenCalled() // did not fall through to the MeshBasicMaterial path
  })
})
