/**
 * Persistent-storage helpers for large in-browser model weights.
 *
 * transformers.js caches weights via the Cache API by default
 * (`env.useBrowserCache`, cache key `transformers-cache`). Verified research
 * (2026-06): the Cache API and OPFS share a single per-origin quota with
 * all-or-nothing LRU eviction, so OPFS gives **no persistence advantage** over
 * the Cache API — its only real benefit is resumable/chunked downloads
 * (transformers.js #1220, unimplemented upstream). The actual protection for
 * multi-GB weights is therefore requesting **persistent** storage, plus warning
 * the user before a download that won't fit.
 *
 * This module provides:
 *  - capability detection (OPFS / Cache API),
 *  - `preferredCacheBackend()` — selection logic (OPFS first, else Cache API),
 *    scaffolding for a future OPFS `env.customCache` backend (deferred: a naive
 *    OPFS cache is strictly worse than the Cache API until chunked/resumable
 *    downloads exist),
 *  - `requestPersistentStorage()` — memoized `navigator.storage.persist()`,
 *  - `getStorageEstimate()` — `navigator.storage.estimate()` headroom for the UI.
 */

export type CacheBackend = 'opfs' | 'cache-api' | 'none'

export interface StorageEstimateInfo {
  /** Bytes currently used by this origin (approximate). */
  usage: number
  /** Bytes available to this origin (approximate). */
  quota: number
  /** Remaining headroom, `max(0, quota - usage)`. */
  available: number
  /** Fraction of quota used, 0..1 (0 when quota is unknown). */
  percentUsed: number
}

/** OPFS (Origin Private File System) — available in windows and workers. */
export function isOPFSAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

/** The Cache API — transformers.js's default weight store. */
export function isCacheApiAvailable(): boolean {
  return typeof caches !== 'undefined'
}

/**
 * Preferred backend for caching model weights: OPFS when available, else the
 * Cache API, else none. Currently informational — the app uses the Cache API
 * default; an OPFS `env.customCache` backend is a deferred phase (see file
 * header). Kept as tested logic so wiring OPFS later is a one-line swap.
 */
export function preferredCacheBackend(): CacheBackend {
  if (isOPFSAvailable()) return 'opfs'
  if (isCacheApiAvailable()) return 'cache-api'
  return 'none'
}

let persistPromise: Promise<boolean> | null = null

/**
 * Request durable (non-evictable) storage so large weights survive storage
 * pressure. Memoized — asks the browser at most once. Resolves true if storage
 * is (or becomes) persistent. Never throws.
 */
export function requestPersistentStorage(): Promise<boolean> {
  if (persistPromise) return persistPromise
  const pending = (async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    try {
      // Already granted? Don't re-prompt.
      if (await navigator.storage.persisted?.()) return true
      return await navigator.storage.persist()
    } catch {
      return false
    }
  })()
  persistPromise = pending
  // A denial isn't permanent: browsers grant based on engagement heuristics that
  // grow over a session, so allow a later call to retry rather than caching the
  // `false`. A granted result stays memoized.
  void pending.then((granted) => {
    if (!granted && persistPromise === pending) persistPromise = null
  })
  return pending
}

/** Test-only: clear the memoized {@link requestPersistentStorage} result. */
export function _resetPersistMemo(): void {
  persistPromise = null
}

/**
 * Current storage headroom, or null when the StorageManager API is unavailable.
 * Values are approximate (the platform fuzzes them for privacy). Never throws.
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const available = Math.max(0, quota - usage)
    const percentUsed = quota > 0 ? usage / quota : 0
    return { usage, quota, available, percentUsed }
  } catch {
    return null
  }
}
