/**
 * RAG node executors — retrieval over in-browser embeddings (retrieve,
 * vector-memory). Extracted from index.ts (Phase 1 de-monolith).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'
import { cosineSimilarity, VectorStore } from '../../services/ai/VectorStore'

interface RetrieveDoc {
  id?: string
  vector?: number[]
  text?: string
}

/**
 * Retrieve node: rank a corpus of pre-embedded documents by cosine similarity to
 * a query embedding and return the top-K. Pure (no model call, no state) — the
 * retrieval step of in-browser RAG. Robust to missing/malformed inputs (returns
 * empty results rather than throwing).
 */
export const retrieveExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const corpus = ctx.inputs.get('corpus') as RetrieveDoc[] | undefined
  const query = ctx.inputs.get('query') as number[] | undefined
  const topK = Math.max(1, Math.floor((ctx.controls.get('topK') as number) ?? 3))

  if (!Array.isArray(corpus) || !Array.isArray(query) || query.length === 0) {
    return new Map<string, unknown>([
      ['matches', []],
      ['context', ''],
      ['bestText', ''],
    ])
  }

  const matches = corpus
    .map((doc, i) => ({
      id: doc?.id ?? String(i),
      score: Array.isArray(doc?.vector) ? cosineSimilarity(query, doc.vector as number[]) : 0,
      text: typeof doc?.text === 'string' ? doc.text : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  const context = matches
    .map((m) => m.text)
    .filter((t) => t.length > 0)
    .join('\n')

  return new Map<string, unknown>([
    ['matches', matches],
    ['context', context],
    ['bestText', matches[0]?.text ?? ''],
  ])
}

/**
 * Vector Memory node: a stateful, incrementally-built RAG corpus. On a rising
 * `add` trigger it stores the current `vector` + `text` in a per-node
 * {@link VectorStore}; on a rising `clear` trigger it empties the store. Each
 * frame it emits the accumulated `corpus` (`{ id, vector, text }[]`, ready to
 * wire straight into the Retrieve node) and the `count`. With `maxSize > 0` it
 * behaves as a ring buffer, evicting the oldest entries — bounding memory in a
 * long-running session. Robust to missing/malformed inputs (never throws).
 */
interface VectorMemoryState {
  store: VectorStore<{ text: string }>
  /** Insertion order of ids, for oldest-first eviction. */
  order: string[]
  /** Monotonic counter for unique record ids. */
  seq: number
  prevAdd: boolean
  prevClear: boolean
  /** Cached corpus output, rebuilt only on mutation (stable reference else). */
  snapshot: RetrieveDoc[]
}

// defineNodeState auto-registers gc/dispose with the engine's generic lifecycle loop.
export const vectorMemoryStores = defineNodeState<VectorMemoryState>({ label: 'vector-memory' })

function getVectorMemoryState(nodeId: string): VectorMemoryState {
  let s = vectorMemoryStores.get(nodeId)
  if (!s) {
    s = {
      store: new VectorStore<{ text: string }>(),
      order: [],
      seq: 0,
      prevAdd: false,
      prevClear: false,
      snapshot: [],
    }
    vectorMemoryStores.set(nodeId, s)
  }
  return s
}

function rebuildVectorMemorySnapshot(s: VectorMemoryState): void {
  s.snapshot = s.store.toJSON().map((r) => ({
    id: r.id,
    vector: r.vector,
    text: r.metadata?.text ?? '',
  }))
}

export const vectorMemoryExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const s = getVectorMemoryState(ctx.nodeId)
  const addPressed = Boolean(ctx.inputs.get('add'))
  const clearPressed = Boolean(ctx.inputs.get('clear'))
  let mutated = false

  // Clear on rising edge.
  if (clearPressed && !s.prevClear) {
    s.store.clear()
    s.order.length = 0
    s.seq = 0
    mutated = true
  }
  s.prevClear = clearPressed

  // Add on rising edge.
  if (addPressed && !s.prevAdd) {
    const vector = ctx.inputs.get('vector')
    if (Array.isArray(vector) && vector.length > 0) {
      const rawText = ctx.inputs.get('text')
      const text =
        typeof rawText === 'string'
          ? rawText
          : typeof rawText === 'number'
            ? String(rawText)
            : ''
      const id = `${ctx.nodeId}#${s.seq}`
      try {
        // Throws on an empty vector or a dimension mismatch — leave the store
        // unchanged so a stray embedding can't corrupt the corpus or crash.
        s.store.add(id, vector as number[], { text })
        s.seq++
        s.order.push(id)
        mutated = true

        const maxSize = Math.floor((ctx.controls.get('maxSize') as number) ?? 0)
        if (maxSize > 0) {
          while (s.order.length > maxSize) {
            const oldest = s.order.shift()
            if (oldest !== undefined) s.store.remove(oldest)
          }
        }
      } catch {
        // Malformed embedding (empty / dimension mismatch) — ignored.
      }
    }
  }
  s.prevAdd = addPressed

  if (mutated) rebuildVectorMemorySnapshot(s)

  return new Map<string, unknown>([
    ['corpus', s.snapshot],
    ['count', s.store.size],
  ])
}
