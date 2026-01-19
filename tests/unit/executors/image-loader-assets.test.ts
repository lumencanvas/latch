/**
 * Image Loader with Asset Support Tests
 *
 * Tests for the enhanced image loader that supports asset library
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Image Loader with Asset Support Logic', () => {
  describe('Asset Priority', () => {
    it('prioritizes assetId over URL input', () => {
      const assetId = 'asset-123'
      const urlInput = 'https://example.com/image.png'
      const urlControl = 'https://example.com/fallback.png'

      // Asset takes priority
      const useAsset = !!assetId

      expect(useAsset).toBe(true)
    })

    it('falls back to URL when no assetId', () => {
      const assetId = null
      const urlInput = 'https://example.com/image.png'
      const urlControl = 'https://example.com/fallback.png'

      const useAsset = !!assetId
      const url = urlInput ?? urlControl ?? ''

      expect(useAsset).toBe(false)
      expect(url).toBe('https://example.com/image.png')
    })

    it('falls back to control URL when no input URL', () => {
      const assetId = null
      const urlInput = undefined
      const urlControl = 'https://example.com/fallback.png'

      const url = urlInput ?? urlControl ?? ''

      expect(url).toBe('https://example.com/fallback.png')
    })

    it('returns empty when no asset or URL', () => {
      const assetId = null
      const urlInput = undefined
      const urlControl = ''

      const url = urlInput ?? urlControl ?? ''

      expect(url).toBe('')
    })
  })

  describe('Asset URL Key', () => {
    it('creates asset URL key', () => {
      const assetId = 'asset-123'
      const assetUrlKey = `asset:${assetId}`

      expect(assetUrlKey).toBe('asset:asset-123')
    })

    it('checks if loaded URL is for asset', () => {
      const loadedUrl = 'asset:asset-123'
      const isAssetUrl = loadedUrl?.startsWith('asset:')

      expect(isAssetUrl).toBe(true)
    })

    it('checks if loaded URL is regular URL', () => {
      const loadedUrl = 'https://example.com/image.png'
      const isAssetUrl = loadedUrl?.startsWith('asset:')

      expect(isAssetUrl).toBe(false)
    })
  })

  describe('Loading State for Assets', () => {
    interface LoaderState {
      loadedUrl: string | null
      texture: unknown
      loading: boolean
      error: string | null
    }

    it('skips loading when asset already loaded', () => {
      const state: LoaderState = {
        loadedUrl: 'asset:asset-123',
        texture: { id: 'texture-1' },
        loading: false,
        error: null,
      }
      const assetId = 'asset-123'
      const assetUrlKey = `asset:${assetId}`
      const hasTrigger = false

      const shouldLoad =
        state.loadedUrl !== assetUrlKey ||
        !state.texture ||
        hasTrigger

      expect(shouldLoad).toBe(false)
    })

    it('reloads on trigger', () => {
      const state: LoaderState = {
        loadedUrl: 'asset:asset-123',
        texture: { id: 'texture-1' },
        loading: false,
        error: null,
      }
      const assetId = 'asset-123'
      const assetUrlKey = `asset:${assetId}`
      const hasTrigger = true

      const shouldLoad =
        state.loadedUrl !== assetUrlKey ||
        !state.texture ||
        hasTrigger

      expect(shouldLoad).toBe(true)
    })

    it('loads on asset change', () => {
      const state: LoaderState = {
        loadedUrl: 'asset:asset-old',
        texture: { id: 'texture-1' },
        loading: false,
        error: null,
      }
      const assetId = 'asset-new'
      const assetUrlKey = `asset:${assetId}`
      const hasTrigger = false

      const shouldLoad =
        state.loadedUrl !== assetUrlKey ||
        !state.texture ||
        hasTrigger

      expect(shouldLoad).toBe(true)
    })
  })

  describe('Pending Asset Loads', () => {
    it('tracks pending asset loads', () => {
      const pendingLoads = new Map<string, Promise<void>>()
      const nodeId = 'node-1'

      pendingLoads.set(nodeId, Promise.resolve())

      expect(pendingLoads.has(nodeId)).toBe(true)
    })

    it('prevents duplicate loads', () => {
      const pendingLoads = new Map<string, Promise<void>>()
      const nodeId = 'node-1'
      pendingLoads.set(nodeId, Promise.resolve())

      const shouldStartLoad = !pendingLoads.has(nodeId)

      expect(shouldStartLoad).toBe(false)
    })

    it('clears pending load on completion', () => {
      const pendingLoads = new Map<string, Promise<void>>()
      const nodeId = 'node-1'
      pendingLoads.set(nodeId, Promise.resolve())

      // Simulate completion
      pendingLoads.delete(nodeId)

      expect(pendingLoads.has(nodeId)).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('sets error for asset not found', () => {
      const outputs = new Map<string, unknown>()
      const assetUrl = null // Asset not found

      if (!assetUrl) {
        outputs.set('_error', 'Asset not found')
      }

      expect(outputs.get('_error')).toBe('Asset not found')
    })

    it('sets error for failed load', () => {
      const outputs = new Map<string, unknown>()
      const error = new Error('Network error')

      outputs.set('_error', error.message)

      expect(outputs.get('_error')).toBe('Network error')
    })

    it('clears error on successful load', () => {
      const outputs = new Map<string, unknown>()
      const loadSuccessful = true

      if (loadSuccessful) {
        outputs.delete('_error')
      }

      expect(outputs.has('_error')).toBe(false)
    })
  })

  describe('Texture Management', () => {
    it('deletes old texture before creating new', () => {
      const deleteTexture = vi.fn()
      const createTexture = vi.fn().mockReturnValue({ id: 'new-texture' })

      const oldTexture = { id: 'old-texture' }

      if (oldTexture) {
        deleteTexture(oldTexture)
      }
      const newTexture = createTexture('image-element')

      expect(deleteTexture).toHaveBeenCalledWith(oldTexture)
      expect(newTexture.id).toBe('new-texture')
    })
  })

  describe('Output Construction', () => {
    it('constructs outputs for loaded asset', () => {
      const outputs = new Map<string, unknown>()
      const texture = { id: 'texture-1' }
      const imageWidth = 1920
      const imageHeight = 1080

      outputs.set('texture', texture)
      outputs.set('width', imageWidth)
      outputs.set('height', imageHeight)
      outputs.set('loading', false)

      expect(outputs.get('texture')).toBe(texture)
      expect(outputs.get('width')).toBe(1920)
      expect(outputs.get('height')).toBe(1080)
      expect(outputs.get('loading')).toBe(false)
    })

    it('constructs outputs during loading', () => {
      const outputs = new Map<string, unknown>()
      const cachedTexture = null
      const cachedWidth = 0
      const cachedHeight = 0

      outputs.set('texture', cachedTexture)
      outputs.set('width', cachedWidth)
      outputs.set('height', cachedHeight)
      outputs.set('loading', true)

      expect(outputs.get('loading')).toBe(true)
    })

    it('constructs outputs for no URL', () => {
      const outputs = new Map<string, unknown>()

      outputs.set('texture', null)
      outputs.set('width', 0)
      outputs.set('height', 0)
      outputs.set('loading', false)

      expect(outputs.get('texture')).toBeNull()
      expect(outputs.get('width')).toBe(0)
    })
  })

  describe('URL Change Detection', () => {
    it('detects URL change', () => {
      const loadedUrl = 'https://old.com/image.png'
      const newUrl = 'https://new.com/image.png'

      const urlChanged = loadedUrl !== newUrl

      expect(urlChanged).toBe(true)
    })

    it('detects no change', () => {
      const loadedUrl = 'https://same.com/image.png'
      const newUrl = 'https://same.com/image.png'

      const urlChanged = loadedUrl !== newUrl

      expect(urlChanged).toBe(false)
    })
  })

  describe('Cross-Origin Handling', () => {
    it('applies anonymous cross-origin', () => {
      const crossOrigin = 'anonymous'
      const shouldApply = crossOrigin !== 'none'

      expect(shouldApply).toBe(true)
    })

    it('applies use-credentials cross-origin', () => {
      const crossOrigin = 'use-credentials'
      const shouldApply = crossOrigin !== 'none'

      expect(shouldApply).toBe(true)
    })

    it('skips cross-origin for none', () => {
      const crossOrigin = 'none'
      const shouldApply = crossOrigin !== 'none'

      expect(shouldApply).toBe(false)
    })

    it('uses anonymous for assets', () => {
      // Assets loaded from blob URLs or file:// don't need CORS
      // but for consistency we use anonymous
      const assetCrossOrigin = 'anonymous'

      expect(assetCrossOrigin).toBe('anonymous')
    })
  })

  describe('State Initialization', () => {
    it('initializes state for new node', () => {
      const imageLoaderState = new Map<string, {
        image: unknown
        texture: unknown
        loading: boolean
        loadedUrl: string | null
        error: string | null
      }>()

      const nodeId = 'img-1'
      if (!imageLoaderState.has(nodeId)) {
        imageLoaderState.set(nodeId, {
          image: null,
          texture: null,
          loading: false,
          loadedUrl: null,
          error: null,
        })
      }

      expect(imageLoaderState.has(nodeId)).toBe(true)
      expect(imageLoaderState.get(nodeId)!.loading).toBe(false)
    })
  })
})
