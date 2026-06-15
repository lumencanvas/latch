import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  selectRendererBackend,
  isWebGPURendererFlagEnabled,
  setWebGPURendererFlag,
  WEBGPU_RENDERER_FLAG_KEY,
} from '@/services/visual/rendererBackend'

/**
 * Phase 6 (mod/p6-renderer): the experimental WebGPU renderer is opt-in behind a
 * flag and only ever selected when a real GPU adapter exists — otherwise we fall
 * back to the WebGL path. Default OFF means production rendering is unchanged.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('WebGPU renderer feature flag', () => {
  it('is off by default (no stored value)', () => {
    expect(isWebGPURendererFlagEnabled()).toBe(false)
  })

  it('round-trips through localStorage', () => {
    setWebGPURendererFlag(true)
    expect(localStorage.getItem(WEBGPU_RENDERER_FLAG_KEY)).toBe('true')
    expect(isWebGPURendererFlagEnabled()).toBe(true)
    setWebGPURendererFlag(false)
    expect(isWebGPURendererFlagEnabled()).toBe(false)
  })

  it('never throws when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => isWebGPURendererFlagEnabled()).not.toThrow()
    expect(isWebGPURendererFlagEnabled()).toBe(false)
    expect(() => setWebGPURendererFlag(true)).not.toThrow()
  })
})

describe('selectRendererBackend', () => {
  const yes = () => Promise.resolve(true)
  const no = () => Promise.resolve(false)

  it('returns webgl when the flag is off, without probing the adapter', async () => {
    let probed = false
    const gate = () => { probed = true; return Promise.resolve(true) }
    expect(await selectRendererBackend({ webgpu: false, isAvailable: gate })).toBe('webgl')
    expect(probed).toBe(false)
  })

  it('returns webgpu when enabled and an adapter is available', async () => {
    expect(await selectRendererBackend({ webgpu: true, isAvailable: yes })).toBe('webgpu')
  })

  it('falls back to webgl when enabled but no adapter is available', async () => {
    expect(await selectRendererBackend({ webgpu: true, isAvailable: no })).toBe('webgl')
  })

  it('reads the persisted flag when no explicit override is given', async () => {
    setWebGPURendererFlag(true)
    expect(await selectRendererBackend({ isAvailable: yes })).toBe('webgpu')
    setWebGPURendererFlag(false)
    expect(await selectRendererBackend({ isAvailable: yes })).toBe('webgl')
  })

  it('falls back to webgl if the adapter probe throws', async () => {
    const boom = () => Promise.reject(new Error('no gpu'))
    expect(await selectRendererBackend({ webgpu: true, isAvailable: boom })).toBe('webgl')
  })
})
