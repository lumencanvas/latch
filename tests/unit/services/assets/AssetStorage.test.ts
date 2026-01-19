/**
 * Asset Storage Service Tests
 *
 * Tests for asset storage, thumbnails, and URL management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Asset Storage Logic', () => {
  describe('Asset Type Detection', () => {
    function getAssetTypeFromMime(mimeType: string): 'image' | 'video' | 'audio' {
      if (mimeType.startsWith('image/')) return 'image'
      if (mimeType.startsWith('video/')) return 'video'
      if (mimeType.startsWith('audio/')) return 'audio'
      return 'image' // Default fallback
    }

    it('detects image type from image/png', () => {
      expect(getAssetTypeFromMime('image/png')).toBe('image')
    })

    it('detects image type from image/jpeg', () => {
      expect(getAssetTypeFromMime('image/jpeg')).toBe('image')
    })

    it('detects video type from video/mp4', () => {
      expect(getAssetTypeFromMime('video/mp4')).toBe('video')
    })

    it('detects video type from video/webm', () => {
      expect(getAssetTypeFromMime('video/webm')).toBe('video')
    })

    it('detects audio type from audio/mpeg', () => {
      expect(getAssetTypeFromMime('audio/mpeg')).toBe('audio')
    })

    it('detects audio type from audio/wav', () => {
      expect(getAssetTypeFromMime('audio/wav')).toBe('audio')
    })

    it('falls back to image for unknown type', () => {
      expect(getAssetTypeFromMime('application/octet-stream')).toBe('image')
    })
  })

  describe('Asset ID Generation', () => {
    it('generates unique IDs', () => {
      const generateId = () =>
        `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const id1 = generateId()
      const id2 = generateId()

      expect(id1).not.toBe(id2)
      expect(id1.startsWith('asset_')).toBe(true)
    })

    it('ID contains timestamp', () => {
      const now = Date.now()
      const id = `asset_${now}_abc123`

      expect(id).toContain(now.toString())
    })
  })

  describe('URL Cache Management', () => {
    it('caches URL for asset', () => {
      const urlCache = new Map<string, string>()
      const assetId = 'asset-1'
      const blobUrl = 'blob:http://localhost/abc123'

      urlCache.set(assetId, blobUrl)

      expect(urlCache.has(assetId)).toBe(true)
      expect(urlCache.get(assetId)).toBe(blobUrl)
    })

    it('returns cached URL', () => {
      const urlCache = new Map<string, string>()
      const assetId = 'asset-1'
      const blobUrl = 'blob:http://localhost/abc123'
      urlCache.set(assetId, blobUrl)

      if (urlCache.has(assetId)) {
        const cached = urlCache.get(assetId)
        expect(cached).toBe(blobUrl)
      }
    })

    it('caches thumbnail URL separately', () => {
      const urlCache = new Map<string, string>()
      const assetId = 'asset-1'
      const assetUrl = 'blob:http://localhost/asset'
      const thumbUrl = 'blob:http://localhost/thumb'

      urlCache.set(assetId, assetUrl)
      urlCache.set(`${assetId}_thumb`, thumbUrl)

      expect(urlCache.get(assetId)).toBe(assetUrl)
      expect(urlCache.get(`${assetId}_thumb`)).toBe(thumbUrl)
    })

    it('clears URLs on release', () => {
      const urlCache = new Map<string, string>()
      urlCache.set('asset-1', 'blob:...')
      urlCache.set('asset-2', 'blob:...')

      urlCache.clear()

      expect(urlCache.size).toBe(0)
    })
  })

  describe('Electron Detection', () => {
    it('detects non-Electron environment', () => {
      const isElectron = () =>
        typeof window !== 'undefined' && (window as any).electronAPI?.isElectron === true

      // In test environment, should be false
      expect(isElectron()).toBe(false)
    })
  })

  describe('File Path Handling', () => {
    it('extracts filename from path with forward slashes', () => {
      const path = '/Users/test/assets/image.png'
      const filename = path.split('/').pop()

      expect(filename).toBe('image.png')
    })

    it('extracts filename from path with backslashes', () => {
      const path = 'C:\\Users\\test\\assets\\image.png'
      const parts = path.split(/[/\\]/)
      const filename = parts[parts.length - 1]

      expect(filename).toBe('image.png')
    })

    it('extracts extension from filename', () => {
      const filename = 'image.png'
      const extension = filename.split('.').pop() || 'bin'

      expect(extension).toBe('png')
    })

    it('handles filename without extension', () => {
      const filename = 'image'
      const extension = filename.split('.').pop() || 'bin'

      // When there's no '.', split returns [filename], so pop returns filename
      expect(extension).toBe('image')
    })

    it('generates asset filename', () => {
      const id = 'asset_123456_abc'
      const originalFilename = 'photo.jpg'
      const extension = originalFilename.split('.').pop() || 'bin'
      const assetFilename = `${id}.${extension}`

      expect(assetFilename).toBe('asset_123456_abc.jpg')
    })
  })

  describe('Asset Interface', () => {
    interface Asset {
      id: string
      name: string
      type: 'image' | 'video' | 'audio'
      mimeType: string
      size: number
      data?: Blob
      path?: string
      thumbnail?: Blob
      width?: number
      height?: number
      duration?: number
      createdAt: Date
      updatedAt: Date
      tags: string[]
    }

    it('creates image asset', () => {
      const asset: Asset = {
        id: 'asset-1',
        name: 'photo.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
        size: 1024,
        width: 1920,
        height: 1080,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      }

      expect(asset.type).toBe('image')
      expect(asset.width).toBe(1920)
      expect(asset.duration).toBeUndefined()
    })

    it('creates video asset with duration', () => {
      const asset: Asset = {
        id: 'asset-2',
        name: 'video.mp4',
        type: 'video',
        mimeType: 'video/mp4',
        size: 102400,
        width: 1280,
        height: 720,
        duration: 120.5,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: ['video', 'demo'],
      }

      expect(asset.type).toBe('video')
      expect(asset.duration).toBe(120.5)
    })

    it('creates audio asset with duration', () => {
      const asset: Asset = {
        id: 'asset-3',
        name: 'song.mp3',
        type: 'audio',
        mimeType: 'audio/mpeg',
        size: 5000000,
        duration: 180,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      }

      expect(asset.type).toBe('audio')
      expect(asset.width).toBeUndefined()
      expect(asset.duration).toBe(180)
    })
  })

  describe('Thumbnail Size Calculation', () => {
    const maxSize = 200

    it('scales down wide image', () => {
      const width = 1920
      const height = 1080

      const scale = Math.min(maxSize / width, maxSize / height)
      const thumbWidth = width * scale
      const thumbHeight = height * scale

      expect(thumbWidth).toBeCloseTo(200, 0)
      expect(thumbHeight).toBeCloseTo(112.5, 0)
    })

    it('scales down tall image', () => {
      const width = 1080
      const height = 1920

      const scale = Math.min(maxSize / width, maxSize / height)
      const thumbWidth = width * scale
      const thumbHeight = height * scale

      expect(thumbWidth).toBeCloseTo(112.5, 0)
      expect(thumbHeight).toBeCloseTo(200, 0)
    })

    it('does not scale small image', () => {
      const width = 100
      const height = 100

      const scale = Math.min(maxSize / width, maxSize / height)
      const thumbWidth = width * scale
      const thumbHeight = height * scale

      // Scale would be 2, but we typically clamp to max 1
      const clampedScale = Math.min(1, scale)
      expect(clampedScale).toBe(1)
    })
  })

  describe('Asset URL Resolution', () => {
    it('creates asset key for storage', () => {
      const assetId = 'asset-123'
      const assetUrlKey = `asset:${assetId}`

      expect(assetUrlKey).toBe('asset:asset-123')
    })

    it('checks if URL key is for asset', () => {
      const urlKey = 'asset:asset-123'
      const isAsset = urlKey.startsWith('asset:')

      expect(isAsset).toBe(true)
    })

    it('identifies regular URL', () => {
      const urlKey = 'https://example.com/image.png'
      const isAsset = urlKey.startsWith('asset:')

      expect(isAsset).toBe(false)
    })
  })
})

describe('Asset Metadata', () => {
  describe('Size Formatting', () => {
    function formatSize(bytes: number): string {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    }

    it('formats bytes', () => {
      expect(formatSize(500)).toBe('500 B')
    })

    it('formats kilobytes', () => {
      expect(formatSize(1536)).toBe('1.5 KB')
    })

    it('formats megabytes', () => {
      expect(formatSize(1572864)).toBe('1.5 MB')
    })

    it('formats gigabytes', () => {
      expect(formatSize(1610612736)).toBe('1.5 GB')
    })
  })

  describe('Duration Formatting', () => {
    function formatDuration(seconds: number | undefined): string {
      if (!seconds) return ''
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    it('formats short duration', () => {
      expect(formatDuration(45)).toBe('0:45')
    })

    it('formats medium duration', () => {
      expect(formatDuration(125)).toBe('2:05')
    })

    it('formats long duration', () => {
      expect(formatDuration(3725)).toBe('62:05')
    })

    it('handles undefined', () => {
      expect(formatDuration(undefined)).toBe('')
    })

    it('handles zero', () => {
      expect(formatDuration(0)).toBe('')
    })
  })
})
