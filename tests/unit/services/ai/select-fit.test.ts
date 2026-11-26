import { describe, it, expect, vi } from 'vitest'
import type { Env } from '@hackbuild/ai-env'

/** Node model selects say when a model won't run on this device, or only slowly. */
const noGpu: Env = {
  webgpu: false, f16: false, adapter: null, maxBufferBytes: null, isolated: true, protocol: 'https',
  opfs: true, cacheStorage: true, indexedDB: true, threads: 4, deviceMemoryGB: 8, promptApi: false, notes: [],
}

describe('model select fit labels', () => {
  it('marks GPU-only models and slow CPU ones once the probe answers', async () => {
    vi.resetModules()
    vi.doMock('@hackbuild/ai-env', async (orig) => ({ ...(await orig<typeof import('@hackbuild/ai-env')>()), probe: async () => noGpu }))
    const { getModelSelectOptions } = await import('@/services/ai/AIInference')
    const { getAiEnv } = await import('@/services/ai/modelRecords')
    const options = getModelSelectOptions('image-to-text')
    await getAiEnv()
    await new Promise((r) => setTimeout(r, 0))
    const lfm = options.find((o) => o.value === 'onnx-community/LFM2-VL-450M-ONNX')!
    expect(lfm.label).toMatch(/won't run here \(needs webgpu\)/)
    expect(options[0].label).toMatch(/^Default — SmolVLM-256M.* · slow here \(CPU\)$/)
    vi.doUnmock('@hackbuild/ai-env')
  })
})
