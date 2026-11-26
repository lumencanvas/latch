import { openWeightStore, WeightError, type WeightStore } from '@hackbuild/weights'

/**
 * Where model weights live (AI models plan, Phase 5): `@hackbuild/weights`, one store over OPFS,
 * IndexedDB and Cache Storage with resumable Range downloads and one download per file across
 * tabs and workers (Web Locks). Used as transformers.js's custom cache by both AI workers, and
 * read by the Model Manager on the page.
 *
 * Files cached before the switch stay in transformers.js's own Cache API (`transformers-cache`)
 * and are still read from there, so nobody downloads a model twice.
 */

let storePromise: Promise<WeightStore | null> | null = null

/** The shared weight store, or null where no backend opens (it never throws). */
export function weightStore(): Promise<WeightStore | null> {
  storePromise ??= openWeightStore({ onNotice: () => {} }).catch((e) => {
    console.warn('[weights] no store, using the browser cache:', e)
    return null
  })
  return storePromise
}

/** Model files on the Hugging Face hub: `…/<repo>/resolve/<rev>/<file>`. */
const HF_FILE = /^https:\/\/(?:huggingface\.co|hf\.co)\/(.+?)\/resolve\/[^/]+\/(.+)$/

export interface FileProgress { repo: string; file: string; loaded: number; total: number | null }

export interface TransformersCacheLike {
  match(req: string | Request): Promise<Response | undefined>
  put(req: string | Request, res: Response): Promise<void>
}

const urlOf = (r: string | Request) => (typeof r === 'string' ? r : r.url)

const asResponse = (blob: Blob) => new Response(blob, {
  headers: { 'content-length': String(blob.size), 'content-type': blob.type || 'application/octet-stream' },
})

/**
 * transformers.js `env.customCache` over the weight store. Hub files download through the store
 * on `match` (parts, resume, shared across tabs) with progress per file; anything the store can't
 * fetch falls back to transformers.js's own fetch by answering "not cached".
 */
export function transformersWeightCache(
  store: WeightStore,
  opts: { legacy?: Cache | null; onProgress?: (p: FileProgress) => void } = {},
): TransformersCacheLike {
  return {
    async match(req) {
      const url = urlOf(req)
      const old = await opts.legacy?.match(url)
      if (old) return old
      const hub = HF_FILE.exec(url)
      if (!hub) return (await store.has(url)) ? asResponse(await store.get({ url, licence: 'see the model card' })) : undefined
      const [, repo, file] = hub
      try {
        const blob = await store.get(
          { url, licence: 'see the model card' },
          { onProgress: (p) => opts.onProgress?.({ repo, file, loaded: p.loaded, total: p.total }) },
        )
        return asResponse(blob)
      } catch (e) {
        // A full disk or a bad checksum is worth saying; a 404 (optional file) or a gated or
        // offline repo goes back to transformers.js, which reports it the way it always has.
        if (e instanceof WeightError && (e.code === 'quota' || e.code === 'sha256')) throw e
        return undefined
      }
    },
    async put(req, res) {
      const url = urlOf(req)
      if (await store.has(url)) return
      await store.put({ key: url, url, licence: 'see the model card' }, await res.blob())
    },
  }
}

/** Repo of a store key (a hub URL), or null. */
export function repoOfKey(key: string): string | null {
  return HF_FILE.exec(key)?.[1] ?? null
}
