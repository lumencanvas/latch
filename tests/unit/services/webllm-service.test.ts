import { describe, it, expect } from 'vitest'
import { WebLLMService, type EngineFactory, type LLMEngine } from '@/services/ai/WebLLMService'

/**
 * WebLLMService is tested with a MOCK engine factory — the real @mlc-ai/web-llm
 * package (WebGPU + ~14 MB WASM) is never loaded here. This covers the streaming
 * accumulation, the WebGPU capability gate, engine reuse/reload, and cleanup;
 * the actual WebGPU inference is browser-validated separately.
 */

interface CreateOpts {
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
}

function mockEngine(tokens: string[], hooks?: { onCreate?: (opts: CreateOpts) => void }): LLMEngine {
  return {
    chat: {
      completions: {
        create: async (opts) => {
          hooks?.onCreate?.(opts as CreateOpts)
          return (async function* () {
            for (const t of tokens) yield { choices: [{ delta: { content: t } }] }
            yield { choices: [{ delta: {} }], usage: {} }
          })()
        },
      },
    },
    interruptGenerate: () => {},
    unload: async () => {},
  }
}

function factoryFor(engine: LLMEngine): EngineFactory {
  return async (_model, onProgress) => {
    onProgress({ progress: 1, text: 'ready' })
    return { engine, dispose: async () => {} }
  }
}

describe('WebLLMService', () => {
  it('streams tokens and accumulates text through to done', async () => {
    const svc = new WebLLMService({
      gpuCheck: async () => true,
      engineFactory: factoryFor(mockEngine(['Hel', 'lo', ' world'])),
    })
    await svc.startGeneration('n', { model: 'M', prompt: 'hi' })
    expect(svc.getState('n').text).toBe('Hello world')
    expect(svc.getState('n').status).toBe('done')
  })

  it('reports an unsupported state when WebGPU is unavailable', async () => {
    const svc = new WebLLMService({
      gpuCheck: async () => false,
      engineFactory: factoryFor(mockEngine(['x'])),
    })
    await svc.startGeneration('n', { model: 'M', prompt: 'hi' })
    expect(svc.getState('n').status).toBe('unsupported')
    expect(svc.getState('n').error).toMatch(/WebGPU/)
  })

  it('captures engine/load errors instead of throwing', async () => {
    const failing: EngineFactory = async () => {
      throw new Error('load failed')
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: failing })
    await svc.startGeneration('n', { model: 'M', prompt: 'hi' })
    expect(svc.getState('n').status).toBe('error')
    expect(svc.getState('n').error).toBe('load failed')
  })

  it('builds system + user messages and forwards generation params', async () => {
    let seen: CreateOpts | undefined
    const engine = mockEngine(['ok'], { onCreate: (o) => (seen = o) })
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factoryFor(engine) })
    await svc.startGeneration('n', {
      model: 'M',
      prompt: 'Q',
      system: 'S',
      temperature: 0.2,
      maxTokens: 99,
    })
    expect(seen?.messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'Q' },
    ])
    expect(seen?.temperature).toBe(0.2)
    expect(seen?.max_tokens).toBe(99)
  })

  it('keeps multiple models loaded and reuses by model id', async () => {
    let creates = 0
    let disposes = 0
    const factory: EngineFactory = async () => {
      creates++
      return { engine: mockEngine(['x']), dispose: async () => void disposes++ }
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factory })
    await svc.startGeneration('a', { model: 'M1', prompt: '1' })
    await svc.startGeneration('a', { model: 'M1', prompt: '2' })
    expect(creates).toBe(1) // same model reused
    await svc.startGeneration('a', { model: 'M2', prompt: '3' })
    expect(creates).toBe(2) // second model loaded...
    expect(disposes).toBe(0) // ...without unloading the first
    expect(svc.loadedModels().sort()).toEqual(['M1', 'M2'])
    await svc.startGeneration('a', { model: 'M1', prompt: '4' })
    expect(creates).toBe(2) // M1 still loaded, reused
  })

  it('preloads, reports load state, and unloads models (manager API)', async () => {
    let creates = 0
    let disposes = 0
    const factory: EngineFactory = async () => {
      creates++
      return { engine: mockEngine(['x']), dispose: async () => void disposes++ }
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factory })
    expect(await svc.preload('M1')).toBe(true)
    expect(svc.isLoaded('M1')).toBe(true)
    expect(svc.getLoadState('M1')?.status).toBe('loaded')
    expect(await svc.preload('M1')).toBe(true) // idempotent
    expect(creates).toBe(1)
    await svc.preload('M2')
    expect(svc.loadedModels().sort()).toEqual(['M1', 'M2'])
    await svc.unload('M1')
    expect(svc.isLoaded('M1')).toBe(false)
    expect(svc.getLoadState('M1')).toBeUndefined()
    expect(disposes).toBe(1)
    expect(svc.loadedModels()).toEqual(['M2'])
  })

  it('preload returns false (and records error) on failure or no WebGPU', async () => {
    const failing: EngineFactory = async () => {
      throw new Error('nope')
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: failing })
    expect(await svc.preload('M')).toBe(false)
    expect(svc.getLoadState('M')?.status).toBe('error')

    const noGpu = new WebLLMService({ gpuCheck: async () => false, engineFactory: factoryFor(mockEngine(['x'])) })
    expect(await noGpu.preload('M')).toBe(false)
    expect(noGpu.isLoaded('M')).toBe(false)
  })

  it('notifies subscribers on load + unload, and stops after unsubscribe', async () => {
    let n = 0
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factoryFor(mockEngine(['x'])) })
    const unsub = svc.subscribe(() => n++)
    await svc.preload('M')
    expect(n).toBeGreaterThan(0)
    const afterLoad = n
    await svc.unload('M')
    expect(n).toBeGreaterThan(afterLoad)
    unsub()
    const afterUnsub = n
    await svc.preload('M2')
    expect(n).toBe(afterUnsub) // no longer notified
  })

  it('stopActive settles the generation but keeps loaded engines', async () => {
    let disposes = 0
    const svc = new WebLLMService({
      gpuCheck: async () => true,
      engineFactory: async () => ({ engine: mockEngine(['x']), dispose: async () => void disposes++ }),
    })
    await svc.preload('M')
    await svc.startGeneration('a', { model: 'M', prompt: 'p' })
    svc.stopActive()
    expect(svc.isLoaded('M')).toBe(true) // engine kept loaded
    expect(disposes).toBe(0)
    expect(svc.getState('a').status).toBe('idle') // per-node state cleared
  })

  it('creates only one engine when generations race during a slow model load', async () => {
    // Regression: the genToken guards the stream, but engine creation must also
    // be serialized — two triggers during a multi-GB load (e.g. an impatient
    // double-click, or two LLM nodes) must not both run the factory and leak the
    // engine whose handle gets overwritten without dispose().
    let creates = 0
    let disposes = 0
    let releaseLoad!: () => void
    const loadGate = new Promise<void>((r) => (releaseLoad = r))
    const factory: EngineFactory = async () => {
      creates++
      await loadGate // simulate a slow model load
      return { engine: mockEngine(['x']), dispose: async () => void disposes++ }
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factory })

    const p1 = svc.startGeneration('a', { model: 'M', prompt: '1' })
    const p2 = svc.startGeneration('b', { model: 'M', prompt: '2' })
    await Promise.resolve() // let both reach ensureEngine while the load is gated
    releaseLoad()
    await Promise.all([p1, p2])

    expect(creates).toBe(1) // one engine despite the racing triggers
    expect(disposes).toBe(0) // nothing created-then-orphaned
  })

  it('supersedes an in-flight generation when another starts (shared engine)', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => (releaseA = r))
    const engine: LLMEngine = {
      chat: {
        completions: {
          create: async (opts) => {
            const isA = opts.messages.some((m) => m.content === 'A')
            return (async function* () {
              if (isA) {
                yield { choices: [{ delta: { content: 'a1' } }] }
                await aGate // pause A mid-stream until B has run
                yield { choices: [{ delta: { content: 'a2' } }] } // must be ignored (superseded)
              } else {
                yield { choices: [{ delta: { content: 'b1' } }] }
              }
            })()
          },
        },
      },
      interruptGenerate: () => {},
      unload: async () => {},
    }
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factoryFor(engine) })

    const pA = svc.startGeneration('A', { model: 'M', prompt: 'A' })
    await new Promise((r) => setTimeout(r, 10)) // let A stream 'a1' and park at the gate
    const pB = svc.startGeneration('B', { model: 'M', prompt: 'B' })
    await pB
    releaseA() // resume A — its 'a2' must be dropped because B superseded it
    await pA

    expect(svc.getState('B').text).toBe('b1')
    expect(svc.getState('B').status).toBe('done')
    expect(svc.getState('A').text).toBe('a1') // 'a2' never landed
    expect(svc.getState('A').status).toBe('done') // settled by supersession
  })

  it('defaults to idle and clears state via gc / disposeNode / disposeAll', async () => {
    let disposed = false
    const factory: EngineFactory = async () => ({
      engine: mockEngine(['x']),
      dispose: async () => void (disposed = true),
    })
    const svc = new WebLLMService({ gpuCheck: async () => true, engineFactory: factory })
    expect(svc.getState('missing').status).toBe('idle')

    await svc.startGeneration('a', { model: 'M', prompt: 'p' })
    await svc.startGeneration('b', { model: 'M', prompt: 'p' })
    svc.gc(new Set(['a']))
    expect(svc.getState('b').status).toBe('idle') // gc'd
    svc.disposeNode('a')
    expect(svc.getState('a').status).toBe('idle')

    await svc.startGeneration('c', { model: 'M', prompt: 'p' })
    await svc.disposeAll()
    expect(disposed).toBe(true)
    expect(svc.getState('c').status).toBe('idle')
  })
})
