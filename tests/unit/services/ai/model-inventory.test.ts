import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  deleteStoredModel, lastUsedOf, listStoredModels, markModelUsed, modelFacts, modelUsage, repoMatches, repoOfUrl,
} from '@/services/ai/modelInventory'

/** AI models plan, Phase 4: one inventory over every model — who uses it, what is on disk. */

function fakeCaches(entries: Record<string, Record<string, number>>) {
  const stores = new Map(Object.entries(entries).map(([name, files]) => [name, new Map(Object.entries(files))]))
  const open = async (name: string) => {
    const files = stores.get(name)!
    return {
      keys: async () => [...files.keys()].map((url) => ({ url })),
      match: async (req: { url: string }) => new Response(null, { headers: { 'content-length': String(files.get(req.url)) } }),
      delete: async (req: { url: string }) => files.delete(req.url),
    }
  }
  return { keys: async () => [...stores.keys()], open, stores }
}

describe('model inventory', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('finds which flows use each model, including defaults, the LLM node and MediaPipe', () => {
    const flows = [{
      id: 'f1', name: 'Room', nodes: [
        { id: 'a', data: { nodeType: 'depth-estimation', model: '' } },
        { id: 'b', data: { nodeType: 'image-captioning', model: 'onnx-community/LFM2-VL-450M-ONNX', label: 'Caption' } },
        { id: 'c', data: { nodeType: 'llm', model: '' } },
        { id: 'd', data: { nodeType: 'mediapipe-hand' } },
        { id: 'e', data: { nodeType: 'constant' } },
      ],
    }]
    const uses = modelUsage(flows, 'Llama-3.2-1B-Instruct-q4f16_1-MLC')
    expect(uses.get('onnx-community/depth-anything-v2-small')?.[0].nodeId).toBe('a')
    expect(uses.get('onnx-community/LFM2-VL-450M-ONNX')?.[0].label).toBe('Caption')
    expect(uses.get('Llama-3.2-1B-Instruct-q4f16_1-MLC')?.[0].flowName).toBe('Room')
    expect(uses.get('mediapipe:hand')).toHaveLength(1)
    expect(uses.size).toBe(4)
  })

  it('reads cached weight URLs as repos and matches WebLLM ids to their repo', () => {
    expect(repoOfUrl('https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_fp16.onnx'))
      .toBe('onnx-community/depth-anything-v2-small')
    expect(repoOfUrl('https://raw.githubusercontent.com/x/y.wasm')).toBeNull()
    expect(repoMatches('mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC')).toBe(true)
    expect(repoMatches('mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B')).toBe(false)
  })

  it('lists downloads by repo, biggest first, and deletes one model from every cache', async () => {
    const hf = (repo: string, f: string) => `https://huggingface.co/${repo}/resolve/main/${f}`
    const fake = fakeCaches({
      'transformers-cache': { [hf('a/small', 'm.onnx')]: 10, [hf('a/big', 'm.onnx')]: 500, [hf('a/big', 'c.json')]: 5 },
      'webllm/model': { [hf('mlc-ai/Qwen-MLC', 'p0.bin')]: 200, 'https://example.com/other': 9 },
    })
    vi.stubGlobal('caches', fake)
    const list = await listStoredModels()
    expect(list.map((s) => [s.repo, s.bytes, s.files])).toEqual([['a/big', 505, 2], ['mlc-ai/Qwen-MLC', 200, 1], ['a/small', 10, 1]])
    markModelUsed('a/big', 123)
    expect(await deleteStoredModel('a/big')).toBe(505)
    expect((await listStoredModels()).map((s) => s.repo)).toEqual(['mlc-ai/Qwen-MLC', 'a/small'])
    expect(lastUsedOf('a/big')).toBeNull()
  })

  it('remembers when a model was last loaded, matching repo and WebLLM id both ways', () => {
    markModelUsed('Qwen-MLC', 1000)
    expect(lastUsedOf('mlc-ai/Qwen-MLC')).toBe(1000)
    expect(lastUsedOf('nobody/else')).toBeNull()
  })

  it('gives the prompt and the manager the same facts for a model', () => {
    const f = modelFacts('image-to-text', 'onnx-community/LFM2-VL-450M-ONNX', null)
    expect(f.badge).toBeTruthy()
    expect(f.licence).toBeTruthy()
    expect(modelFacts('depth-estimation', '', null).id).toBe('onnx-community/depth-anything-v2-small')
  })
})
