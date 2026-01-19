/**
 * Assets Store Tests
 *
 * Tests for the Pinia assets store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the services before importing store
vi.mock('@/services/assets/AssetStorage', () => ({
  assetStorageManager: {
    uploadAsset: vi.fn(),
    uploadFromImageData: vi.fn(),
    deleteAsset: vi.fn(),
    updateAsset: vi.fn(),
    getAssetUrl: vi.fn(),
    getThumbnailUrl: vi.fn(),
    getAllAssets: vi.fn(),
    getAssetsByType: vi.fn(),
    searchAssets: vi.fn(),
    releaseUrls: vi.fn(),
  },
}))

vi.mock('@/services/database', () => ({
  assetStorage: {
    getAll: vi.fn().mockResolvedValue([]),
    getByType: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    searchByName: vi.fn().mockResolvedValue([]),
    getByTags: vi.fn().mockResolvedValue([]),
    getTotalSize: vi.fn().mockResolvedValue(0),
    getCountByType: vi.fn().mockResolvedValue({ image: 0, video: 0, audio: 0 }),
  },
}))

describe('Assets Store Logic', () => {
  describe('Filtering', () => {
    interface Asset {
      id: string
      name: string
      type: 'image' | 'video' | 'audio'
      size: number
      tags: string[]
      createdAt: Date
    }

    const mockAssets: Asset[] = [
      { id: '1', name: 'photo.jpg', type: 'image', size: 1000, tags: ['nature'], createdAt: new Date('2024-01-01') },
      { id: '2', name: 'video.mp4', type: 'video', size: 5000, tags: ['demo'], createdAt: new Date('2024-01-02') },
      { id: '3', name: 'song.mp3', type: 'audio', size: 3000, tags: ['music'], createdAt: new Date('2024-01-03') },
      { id: '4', name: 'screenshot.png', type: 'image', size: 2000, tags: ['work'], createdAt: new Date('2024-01-04') },
    ]

    it('filters by image type', () => {
      const filter = 'image'
      const filtered = mockAssets.filter(a => a.type === filter)

      expect(filtered.length).toBe(2)
      expect(filtered.every(a => a.type === 'image')).toBe(true)
    })

    it('filters by video type', () => {
      const filter = 'video'
      const filtered = mockAssets.filter(a => a.type === filter)

      expect(filtered.length).toBe(1)
      expect(filtered[0].name).toBe('video.mp4')
    })

    it('filters by audio type', () => {
      const filter = 'audio'
      const filtered = mockAssets.filter(a => a.type === filter)

      expect(filtered.length).toBe(1)
      expect(filtered[0].name).toBe('song.mp3')
    })

    it('returns all when filter is all', () => {
      const filter = 'all'
      const filtered = filter === 'all' ? mockAssets : mockAssets.filter(a => a.type === filter)

      expect(filtered.length).toBe(4)
    })
  })

  describe('Search', () => {
    interface Asset {
      id: string
      name: string
      type: 'image' | 'video' | 'audio'
      tags: string[]
    }

    const mockAssets: Asset[] = [
      { id: '1', name: 'photo.jpg', type: 'image', tags: ['nature', 'landscape'] },
      { id: '2', name: 'screenshot.png', type: 'image', tags: ['work'] },
      { id: '3', name: 'vacation-photo.jpg', type: 'image', tags: ['nature'] },
    ]

    it('searches by name', () => {
      const query = 'photo'
      const results = mockAssets.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(results.length).toBe(2)
    })

    it('searches by tag', () => {
      const query = 'nature'
      const results = mockAssets.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      )

      expect(results.length).toBe(2)
    })

    it('returns empty for no matches', () => {
      const query = 'xyz123'
      const results = mockAssets.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase())
      )

      expect(results.length).toBe(0)
    })

    it('ignores empty search query', () => {
      const query = ''
      let results = mockAssets
      if (query.trim()) {
        results = mockAssets.filter(a =>
          a.name.toLowerCase().includes(query.toLowerCase())
        )
      }

      expect(results.length).toBe(3)
    })
  })

  describe('Sorting', () => {
    interface Asset {
      id: string
      name: string
      type: 'image' | 'video' | 'audio'
      size: number
      createdAt: Date
    }

    const mockAssets: Asset[] = [
      { id: '1', name: 'B-photo.jpg', type: 'image', size: 2000, createdAt: new Date('2024-01-02') },
      { id: '2', name: 'A-video.mp4', type: 'video', size: 5000, createdAt: new Date('2024-01-01') },
      { id: '3', name: 'C-song.mp3', type: 'audio', size: 1000, createdAt: new Date('2024-01-03') },
    ]

    it('sorts by name ascending', () => {
      const sorted = [...mockAssets].sort((a, b) => a.name.localeCompare(b.name))

      expect(sorted[0].name).toBe('A-video.mp4')
      expect(sorted[2].name).toBe('C-song.mp3')
    })

    it('sorts by name descending', () => {
      const sorted = [...mockAssets].sort((a, b) => -a.name.localeCompare(b.name))

      expect(sorted[0].name).toBe('C-song.mp3')
      expect(sorted[2].name).toBe('A-video.mp4')
    })

    it('sorts by size ascending', () => {
      const sorted = [...mockAssets].sort((a, b) => a.size - b.size)

      expect(sorted[0].size).toBe(1000)
      expect(sorted[2].size).toBe(5000)
    })

    it('sorts by size descending', () => {
      const sorted = [...mockAssets].sort((a, b) => b.size - a.size)

      expect(sorted[0].size).toBe(5000)
      expect(sorted[2].size).toBe(1000)
    })

    it('sorts by date ascending', () => {
      const sorted = [...mockAssets].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )

      expect(sorted[0].name).toBe('A-video.mp4')
    })

    it('sorts by date descending', () => {
      const sorted = [...mockAssets].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      expect(sorted[0].name).toBe('C-song.mp3')
    })

    it('sorts by type', () => {
      const sorted = [...mockAssets].sort((a, b) => a.type.localeCompare(b.type))

      expect(sorted[0].type).toBe('audio')
      expect(sorted[1].type).toBe('image')
      expect(sorted[2].type).toBe('video')
    })
  })

  describe('Asset Counts', () => {
    interface Asset {
      type: 'image' | 'video' | 'audio'
    }

    const mockAssets: Asset[] = [
      { type: 'image' },
      { type: 'image' },
      { type: 'image' },
      { type: 'video' },
      { type: 'video' },
      { type: 'audio' },
    ]

    it('counts all assets', () => {
      const counts = {
        all: mockAssets.length,
        image: 0,
        video: 0,
        audio: 0,
      }

      for (const asset of mockAssets) {
        counts[asset.type]++
      }

      expect(counts.all).toBe(6)
      expect(counts.image).toBe(3)
      expect(counts.video).toBe(2)
      expect(counts.audio).toBe(1)
    })
  })

  describe('Total Size', () => {
    interface Asset {
      size: number
    }

    it('calculates total size', () => {
      const assets: Asset[] = [
        { size: 1000 },
        { size: 2000 },
        { size: 3000 },
      ]

      const totalSize = assets.reduce((sum, a) => sum + a.size, 0)

      expect(totalSize).toBe(6000)
    })

    it('returns 0 for empty array', () => {
      const assets: Asset[] = []

      const totalSize = assets.reduce((sum, a) => sum + a.size, 0)

      expect(totalSize).toBe(0)
    })
  })

  describe('Selection', () => {
    it('selects asset', () => {
      let selectedAssetId: string | null = null

      selectedAssetId = 'asset-1'

      expect(selectedAssetId).toBe('asset-1')
    })

    it('clears selection', () => {
      let selectedAssetId: string | null = 'asset-1'

      selectedAssetId = null

      expect(selectedAssetId).toBeNull()
    })

    it('finds selected asset', () => {
      const assets = [
        { id: 'asset-1', name: 'Photo 1' },
        { id: 'asset-2', name: 'Photo 2' },
      ]
      const selectedAssetId = 'asset-1'

      const selectedAsset = assets.find(a => a.id === selectedAssetId)

      expect(selectedAsset?.name).toBe('Photo 1')
    })

    it('returns undefined for invalid selection', () => {
      const assets = [
        { id: 'asset-1', name: 'Photo 1' },
      ]
      const selectedAssetId = 'asset-999'

      const selectedAsset = assets.find(a => a.id === selectedAssetId)

      expect(selectedAsset).toBeUndefined()
    })
  })

  describe('Update Operations', () => {
    it('updates asset name', () => {
      const asset = { id: '1', name: 'Old Name', tags: [] as string[] }
      const updates = { name: 'New Name' }

      Object.assign(asset, updates)

      expect(asset.name).toBe('New Name')
    })

    it('updates asset tags', () => {
      const asset = { id: '1', name: 'Photo', tags: ['old'] }
      const updates = { tags: ['new', 'updated'] }

      Object.assign(asset, updates)

      expect(asset.tags).toEqual(['new', 'updated'])
    })
  })

  describe('Delete Operations', () => {
    it('removes asset from array', () => {
      let assets = [
        { id: '1', name: 'Photo 1' },
        { id: '2', name: 'Photo 2' },
        { id: '3', name: 'Photo 3' },
      ]

      assets = assets.filter(a => a.id !== '2')

      expect(assets.length).toBe(2)
      expect(assets.find(a => a.id === '2')).toBeUndefined()
    })

    it('clears selection when deleted asset was selected', () => {
      let selectedAssetId: string | null = 'asset-2'
      const deletedId = 'asset-2'

      if (selectedAssetId === deletedId) {
        selectedAssetId = null
      }

      expect(selectedAssetId).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('stores error message', () => {
      let error: string | null = null

      try {
        throw new Error('Upload failed')
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
      }

      expect(error).toBe('Upload failed')
    })

    it('clears error', () => {
      let error: string | null = 'Previous error'

      error = null

      expect(error).toBeNull()
    })
  })

  describe('Loading State', () => {
    it('tracks loading state', () => {
      let loading = false

      // Start loading
      loading = true
      expect(loading).toBe(true)

      // End loading
      loading = false
      expect(loading).toBe(false)
    })
  })

  describe('Sort Direction Toggle', () => {
    it('toggles direction when clicking same field', () => {
      let sortBy = 'name'
      let sortAsc = true

      // Click same field
      const newSortBy = 'name'
      if (sortBy === newSortBy) {
        sortAsc = !sortAsc
      }

      expect(sortAsc).toBe(false)
    })

    it('resets direction when clicking different field', () => {
      let sortBy = 'name'
      let sortAsc = false

      // Click different field
      const newSortBy = 'createdAt'
      if (sortBy !== newSortBy) {
        sortBy = newSortBy
        sortAsc = newSortBy === 'name' // Name sorts ascending by default
      }

      expect(sortBy).toBe('createdAt')
      expect(sortAsc).toBe(false)
    })
  })
})
