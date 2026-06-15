import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isOPFSAvailable,
  isCacheApiAvailable,
  preferredCacheBackend,
  requestPersistentStorage,
  getStorageEstimate,
  _resetPersistMemo,
} from '@/services/ai/modelStorage'

/**
 * modelStorage abstracts persistent storage for large in-browser model weights.
 * Per research (2026-06): transformers.js caches weights via the Cache API, and
 * Cache API + OPFS share one per-origin quota with all-or-nothing eviction — so
 * `persist()` (not the backend choice) is the real eviction protection. These
 * tests mock navigator.storage / caches.
 */

function setNavigatorStorage(storage: unknown): void {
  vi.stubGlobal('navigator', { storage })
}

beforeEach(() => {
  _resetPersistMemo()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('capability detection', () => {
  it('isOPFSAvailable reflects navigator.storage.getDirectory', () => {
    setNavigatorStorage({ getDirectory: () => Promise.resolve({}) })
    expect(isOPFSAvailable()).toBe(true)
    setNavigatorStorage({})
    expect(isOPFSAvailable()).toBe(false)
  })

  it('isCacheApiAvailable reflects the global caches object', () => {
    vi.stubGlobal('caches', { open: () => Promise.resolve({}) })
    expect(isCacheApiAvailable()).toBe(true)
    vi.stubGlobal('caches', undefined)
    expect(isCacheApiAvailable()).toBe(false)
  })
})

describe('preferredCacheBackend', () => {
  it('prefers OPFS when available', () => {
    setNavigatorStorage({ getDirectory: () => Promise.resolve({}) })
    vi.stubGlobal('caches', { open: () => {} })
    expect(preferredCacheBackend()).toBe('opfs')
  })

  it('falls back to the Cache API when OPFS is absent', () => {
    setNavigatorStorage({})
    vi.stubGlobal('caches', { open: () => {} })
    expect(preferredCacheBackend()).toBe('cache-api')
  })

  it('returns none when neither is available', () => {
    setNavigatorStorage({})
    vi.stubGlobal('caches', undefined)
    expect(preferredCacheBackend()).toBe('none')
  })
})

describe('requestPersistentStorage', () => {
  it('requests persistence once and memoizes the result', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    setNavigatorStorage({ persist, persisted })

    expect(await requestPersistentStorage()).toBe(true)
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1) // memoized
  })

  it('does not call persist() when storage is already persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(true)
    setNavigatorStorage({ persist, persisted })

    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('retries after a denial so a later call can still be granted', async () => {
    const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const persisted = vi.fn().mockResolvedValue(false)
    setNavigatorStorage({ persist, persisted })

    expect(await requestPersistentStorage()).toBe(false) // denied, memo cleared
    expect(await requestPersistentStorage()).toBe(true) // retried, granted
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('returns false (no throw) when the API is unavailable', async () => {
    setNavigatorStorage(undefined)
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('returns false when persist() rejects', async () => {
    setNavigatorStorage({ persist: vi.fn().mockRejectedValue(new Error('nope')) })
    expect(await requestPersistentStorage()).toBe(false)
  })
})

describe('getStorageEstimate', () => {
  it('computes available headroom and percent used', async () => {
    setNavigatorStorage({ estimate: vi.fn().mockResolvedValue({ usage: 250, quota: 1000 }) })
    const info = await getStorageEstimate()
    expect(info).toEqual({ usage: 250, quota: 1000, available: 750, percentUsed: 0.25 })
  })

  it('handles a zero/absent quota without dividing by zero', async () => {
    setNavigatorStorage({ estimate: vi.fn().mockResolvedValue({}) })
    const info = await getStorageEstimate()
    expect(info).toEqual({ usage: 0, quota: 0, available: 0, percentUsed: 0 })
  })

  it('returns null when the API is unavailable', async () => {
    setNavigatorStorage(undefined)
    expect(await getStorageEstimate()).toBeNull()
  })
})
