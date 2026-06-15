import { describe, it, expect, afterEach, vi } from 'vitest'
import { isWebGPUAvailable } from '@/services/ai/webgpu'

afterEach(() => vi.unstubAllGlobals())

describe('isWebGPUAvailable', () => {
  it('is false when navigator.gpu is absent', async () => {
    vi.stubGlobal('navigator', {})
    expect(await isWebGPUAvailable()).toBe(false)
  })

  it('is false when no adapter is returned', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve(null) } })
    expect(await isWebGPUAvailable()).toBe(false)
  })

  it('is true when an adapter is available', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve({}) } })
    expect(await isWebGPUAvailable()).toBe(true)
  })

  it('is false (no throw) when requestAdapter throws', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: () => {
          throw new Error('boom')
        },
      },
    })
    expect(await isWebGPUAvailable()).toBe(false)
  })
})
