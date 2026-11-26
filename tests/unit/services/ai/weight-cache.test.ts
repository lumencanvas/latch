import { describe, it, expect } from 'vitest'
import { openWeightStore } from '@hackbuild/weights'
import { repoOfKey, transformersWeightCache, type FileProgress } from '@/services/ai/weightCache'

/** AI models plan, Phase 5: transformers.js weights through @hackbuild/weights. */

const HUB = 'https://huggingface.co/org/model/resolve/main'

function server(files: Record<string, Uint8Array>) {
  const calls: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push(url)
    const body = files[url]
    if (!body) return new Response('nope', { status: 404 })
    return new Response(body, { status: 200, headers: { 'content-length': String(body.byteLength) } })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const store = (fetch: typeof globalThis.fetch) =>
  openWeightStore({ backends: ['memory'], fetch, locks: false, onNotice: () => {}, estimate: async () => ({ usage: 0, quota: 1e12 }) })

describe('weight cache for transformers.js', () => {
  it('downloads hub files through the store once, with progress per file', async () => {
    const bytes = new Uint8Array(4096).fill(7)
    const srv = server({ [`${HUB}/onnx/model.onnx`]: bytes })
    const seen: FileProgress[] = []
    const cache = transformersWeightCache(await store(srv.fetch), { onProgress: (p) => seen.push(p) })
    const res = await cache.match(`${HUB}/onnx/model.onnx`)
    expect(new Uint8Array(await res!.arrayBuffer())).toEqual(bytes)
    expect(res!.headers.get('content-length')).toBe('4096')
    expect(seen.at(-1)).toMatchObject({ repo: 'org/model', file: 'onnx/model.onnx', loaded: 4096 })
    await cache.match(`${HUB}/onnx/model.onnx`)
    expect(srv.calls).toHaveLength(1)
  })

  it('answers "not cached" for a missing optional file, so transformers.js handles the 404', async () => {
    const cache = transformersWeightCache(await store(server({}).fetch))
    expect(await cache.match(`${HUB}/generation_config.json`)).toBeUndefined()
  })

  it('reads files cached before the switch from the old Cache API, without fetching', async () => {
    const srv = server({})
    const legacy = { match: async (u: string) => (u.endsWith('config.json') ? new Response('{"a":1}') : undefined) } as unknown as Cache
    const cache = transformersWeightCache(await store(srv.fetch), { legacy })
    expect(await (await cache.match(`${HUB}/config.json`))!.text()).toBe('{"a":1}')
    expect(srv.calls).toHaveLength(0)
  })

  it('stores what transformers.js fetched itself (non-hub URLs) on put', async () => {
    const cache = transformersWeightCache(await store(server({}).fetch))
    await cache.put('https://example.com/x.bin', new Response(new Uint8Array([1, 2, 3])))
    expect(new Uint8Array(await (await cache.match('https://example.com/x.bin'))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('names the repo of a store key', () => {
    expect(repoOfKey(`${HUB}/onnx/model.onnx`)).toBe('org/model')
    expect(repoOfKey('https://example.com/x.bin')).toBeNull()
  })
})
