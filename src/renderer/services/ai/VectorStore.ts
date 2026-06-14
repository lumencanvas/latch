/**
 * In-browser vector store for retrieval-augmented generation (RAG).
 *
 * Small models have short context windows, so the practical way to "handle more
 * context" in-browser is RAG: embed chunks (via the feature-extraction AI node),
 * keep the vectors here, and retrieve the top-k most similar chunks for a query
 * to inject into the prompt. This is the reusable, dependency-free core; the
 * Embed / Vector Store / Retrieve nodes wire it to the embedding model.
 *
 * Brute-force cosine over a Map — fine for the thousands-of-vectors range typical
 * of a creative tool. Pure logic (no DOM/Worker/WebGPU/network), fully testable.
 */

export interface VectorRecord<M = unknown> {
  id: string
  vector: number[]
  metadata?: M
}

export interface VectorMatch<M = unknown> {
  id: string
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number
  metadata?: M
}

/**
 * Cosine similarity of two equal-length vectors. Returns 0 for a dimension
 * mismatch, an empty vector, or a zero-magnitude vector (rather than NaN/throw)
 * so a malformed embedding can't crash the graph.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class VectorStore<M = unknown> {
  private readonly records = new Map<string, VectorRecord<M>>()
  /** Dimensionality of stored vectors (set by the first add); null when empty. */
  private dim: number | null = null

  get size(): number {
    return this.records.size
  }

  /** The dimensionality all vectors must match, or null while empty. */
  get dimension(): number | null {
    return this.dim
  }

  /**
   * Add (or replace) a record. Throws on an empty vector or a dimension that
   * doesn't match earlier records — a fast signal that two different embedding
   * models got mixed, which would otherwise silently produce garbage scores.
   */
  add(id: string, vector: number[], metadata?: M): void {
    if (vector.length === 0) {
      throw new Error('VectorStore: cannot add an empty vector')
    }
    if (this.dim === null) {
      this.dim = vector.length
    } else if (vector.length !== this.dim) {
      throw new Error(
        `VectorStore: dimension mismatch (expected ${this.dim}, got ${vector.length})`,
      )
    }
    this.records.set(id, { id, vector: vector.slice(), metadata })
  }

  has(id: string): boolean {
    return this.records.has(id)
  }

  get(id: string): VectorRecord<M> | undefined {
    const rec = this.records.get(id)
    return rec ? { ...rec, vector: rec.vector.slice() } : undefined
  }

  remove(id: string): boolean {
    const removed = this.records.delete(id)
    if (removed && this.records.size === 0) this.dim = null
    return removed
  }

  clear(): void {
    this.records.clear()
    this.dim = null
  }

  /**
   * Top-k records by cosine similarity to `vector`, highest first. A query whose
   * dimension doesn't match scores 0 (via cosineSimilarity), so it returns
   * results but with zero relevance rather than throwing.
   */
  query(vector: number[], topK = 5): VectorMatch<M>[] {
    if (this.records.size === 0 || topK <= 0) return []
    const scored: VectorMatch<M>[] = []
    for (const rec of this.records.values()) {
      scored.push({ id: rec.id, score: cosineSimilarity(vector, rec.vector), metadata: rec.metadata })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  /** Serializable snapshot (vectors copied) for persistence via Dexie/IndexedDB. */
  toJSON(): VectorRecord<M>[] {
    return [...this.records.values()].map((r) => ({ ...r, vector: r.vector.slice() }))
  }

  /** Rebuild a store from a {@link toJSON} snapshot. */
  static fromJSON<M = unknown>(records: VectorRecord<M>[]): VectorStore<M> {
    const store = new VectorStore<M>()
    for (const r of records) store.add(r.id, r.vector, r.metadata)
    return store
  }
}
