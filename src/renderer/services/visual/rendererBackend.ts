/**
 * Renderer backend selection (Phase 6 — mod/p6-renderer).
 *
 * LATCH renders 3D/shader nodes with a Three.js `WebGLRenderer` today. r184
 * unlocks `three/webgpu`'s `WebGPURenderer` (async `init()`, WGSL/TSL). This
 * module is the **opt-in, default-off** seam for it: pick a backend (only ever
 * WebGPU when a real adapter exists, else WebGL) and construct a WebGPU renderer
 * lazily so the heavy `three/webgpu` chunk stays out of the main bundle.
 *
 * NOTE: this does not yet replace `ThreeRenderer`. Its `render()` returns a raw
 * `WebGLTexture` (via `properties.get(...).__webglTexture`) that the texture
 * bridge / compositor consume; `WebGPURenderer` produces a `GPUTexture` instead,
 * so wiring WebGPU into that pipeline is a separate slice (see the plan). Until
 * then the flag only enables this isolated path for validation.
 */

import type { WebGPURenderer } from 'three/webgpu'
import { isWebGPUAvailable } from '@/services/ai/webgpu'

export type RendererBackend = 'webgl' | 'webgpu'

/** localStorage key holding the experimental WebGPU-renderer opt-in (`'true'`). */
export const WEBGPU_RENDERER_FLAG_KEY = 'latch.renderer.webgpu'

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** Whether the user has opted into the experimental WebGPU renderer. Default off. */
export function isWebGPURendererFlagEnabled(): boolean {
  return safeLocalStorage()?.getItem(WEBGPU_RENDERER_FLAG_KEY) === 'true'
}

/** Persist the WebGPU-renderer opt-in (no-op when storage is unavailable). */
export function setWebGPURendererFlag(enabled: boolean): void {
  const store = safeLocalStorage()
  if (!store) return
  try {
    if (enabled) store.setItem(WEBGPU_RENDERER_FLAG_KEY, 'true')
    else store.removeItem(WEBGPU_RENDERER_FLAG_KEY)
  } catch {
    /* ignore quota / disabled-storage errors */
  }
}

/**
 * Decide which renderer backend to use. WebGPU is chosen only when it's both
 * opted-in (explicit `webgpu` override, else the persisted flag) AND a real GPU
 * adapter is present; any failure or absence falls back to WebGL. Never throws.
 */
export async function selectRendererBackend(opts: {
  /** Override the persisted flag (mainly for tests / programmatic callers). */
  webgpu?: boolean
  /** Injectable adapter probe (defaults to the shared `isWebGPUAvailable`). */
  isAvailable?: () => Promise<boolean>
} = {}): Promise<RendererBackend> {
  const want = opts.webgpu ?? isWebGPURendererFlagEnabled()
  if (!want) return 'webgl'
  const probe = opts.isAvailable ?? isWebGPUAvailable
  try {
    return (await probe()) ? 'webgpu' : 'webgl'
  } catch {
    return 'webgl'
  }
}

/**
 * Construct and initialize a Three.js `WebGPURenderer`. `three/webgpu` is
 * dynamic-imported so it only loads when WebGPU is actually used (keeps it out
 * of the main bundle). The renderer's async `init()` is awaited before return.
 */
export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  options: { antialias?: boolean; alpha?: boolean } = {}
): Promise<WebGPURenderer> {
  const { WebGPURenderer } = await import('three/webgpu')
  const renderer = new WebGPURenderer({
    canvas,
    antialias: options.antialias ?? true,
    alpha: options.alpha ?? true,
  })
  await renderer.init()
  return renderer
}
