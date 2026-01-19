/**
 * Asset Storage Service
 *
 * Provides unified asset storage interface that works across
 * Web (IndexedDB/Blob URLs) and Electron (filesystem).
 */

import { assetStorage, type Asset, type AssetType } from '../database'

// Detect if running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true
}

// URL cache for blob URLs
const urlCache = new Map<string, string>()

/**
 * Generate thumbnail for image/video
 */
async function generateThumbnail(
  file: File | Blob,
  type: AssetType
): Promise<Blob | undefined> {
  const maxSize = 200

  return new Promise((resolve) => {
    if (type === 'image') {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height)
        canvas.width = img.width * scale
        canvas.height = img.height * scale

        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url)
            resolve(blob ?? undefined)
          },
          'image/jpeg',
          0.8
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(undefined)
      }

      img.src = url
    } else if (type === 'video') {
      const video = document.createElement('video')
      const url = URL.createObjectURL(file)

      video.onloadeddata = () => {
        video.currentTime = 1 // Seek to 1 second for thumbnail
      }

      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight)
        canvas.width = video.videoWidth * scale
        canvas.height = video.videoHeight * scale

        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url)
            resolve(blob ?? undefined)
          },
          'image/jpeg',
          0.8
        )
      }

      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(undefined)
      }

      video.src = url
      video.load()
    } else {
      // Audio - no thumbnail
      resolve(undefined)
    }
  })
}

/**
 * Get image/video dimensions
 */
async function getDimensions(
  file: File | Blob,
  type: AssetType
): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)

    if (type === 'image') {
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({})
      }
      img.src = url
    } else if (type === 'video') {
      const video = document.createElement('video')
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        })
      }
      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({})
      }
      video.src = url
      video.load()
    } else if (type === 'audio') {
      const audio = new Audio()
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve({ duration: audio.duration })
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({})
      }
      audio.src = url
    } else {
      URL.revokeObjectURL(url)
      resolve({})
    }
  })
}

/**
 * Determine asset type from MIME type
 */
function getAssetTypeFromMime(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'image' // Default fallback
}

/**
 * Asset Storage Manager
 */
class AssetStorageManager {
  /**
   * Upload a new asset from file
   */
  async uploadAsset(file: File): Promise<Asset> {
    const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const type = getAssetTypeFromMime(file.type)
    const now = new Date()

    // Generate thumbnail and get dimensions
    const [thumbnail, dimensions] = await Promise.all([
      generateThumbnail(file, type),
      getDimensions(file, type),
    ])

    const asset: Asset = {
      id,
      name: file.name,
      type,
      mimeType: file.type,
      size: file.size,
      thumbnail,
      width: dimensions.width,
      height: dimensions.height,
      duration: dimensions.duration,
      createdAt: now,
      updatedAt: now,
      tags: [],
    }

    if (isElectron()) {
      // Electron: Save to filesystem
      const path = await this.saveToFilesystem(file, id)
      asset.path = path
    } else {
      // Web: Store blob in IndexedDB
      asset.data = file
    }

    await assetStorage.save(asset)
    return asset
  }

  /**
   * Upload from ImageData
   */
  async uploadFromImageData(
    imageData: ImageData,
    name: string
  ): Promise<Asset> {
    // Convert ImageData to Blob
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(imageData, 0, 0)

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b!),
        'image/png'
      )
    })

    const file = new File([blob], name, { type: 'image/png' })
    return this.uploadAsset(file)
  }

  /**
   * Upload from URL (data URL or blob URL)
   */
  async uploadFromUrl(url: string, name: string): Promise<Asset> {
    const response = await fetch(url)
    const blob = await response.blob()
    const file = new File([blob], name, { type: blob.type })
    return this.uploadAsset(file)
  }

  /**
   * Get asset URL for loading
   */
  async getAssetUrl(assetId: string): Promise<string | null> {
    // Check cache first
    if (urlCache.has(assetId)) {
      return urlCache.get(assetId)!
    }

    const asset = await assetStorage.getById(assetId)
    if (!asset) return null

    let url: string

    if (isElectron() && asset.path) {
      // Electron: Use file:// URL
      url = `file://${asset.path}`
    } else if (asset.data) {
      // Web: Create blob URL
      url = URL.createObjectURL(asset.data)
      urlCache.set(assetId, url)
    } else {
      return null
    }

    return url
  }

  /**
   * Get thumbnail URL
   */
  async getThumbnailUrl(assetId: string): Promise<string | null> {
    const cacheKey = `${assetId}_thumb`
    if (urlCache.has(cacheKey)) {
      return urlCache.get(cacheKey)!
    }

    const asset = await assetStorage.getById(assetId)
    if (!asset?.thumbnail) return null

    const url = URL.createObjectURL(asset.thumbnail)
    urlCache.set(cacheKey, url)
    return url
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<void> {
    const asset = await assetStorage.getById(assetId)

    if (asset) {
      // Clean up cached URLs
      const cachedUrl = urlCache.get(assetId)
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl)
        urlCache.delete(assetId)
      }

      const thumbUrl = urlCache.get(`${assetId}_thumb`)
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl)
        urlCache.delete(`${assetId}_thumb`)
      }

      // Electron: Delete from filesystem
      if (isElectron() && asset.path) {
        await this.deleteFromFilesystem(asset.path)
      }
    }

    await assetStorage.delete(assetId)
  }

  /**
   * Update asset metadata
   */
  async updateAsset(
    assetId: string,
    updates: Partial<Pick<Asset, 'name' | 'tags'>>
  ): Promise<void> {
    const asset = await assetStorage.getById(assetId)
    if (!asset) return

    const updated = {
      ...asset,
      ...updates,
      updatedAt: new Date(),
    }

    await assetStorage.save(updated)
  }

  /**
   * Get all assets
   */
  async getAllAssets(): Promise<Asset[]> {
    return assetStorage.getAll()
  }

  /**
   * Get assets by type
   */
  async getAssetsByType(type: AssetType): Promise<Asset[]> {
    return assetStorage.getByType(type)
  }

  /**
   * Search assets
   */
  async searchAssets(query: string): Promise<Asset[]> {
    return assetStorage.searchByName(query)
  }

  /**
   * Release cached URLs (call on unmount)
   */
  releaseUrls(): void {
    for (const url of urlCache.values()) {
      URL.revokeObjectURL(url)
    }
    urlCache.clear()
  }

  // =========================================================================
  // Electron-specific methods
  // =========================================================================

  private async saveToFilesystem(file: File, id: string): Promise<string> {
    if (!window.electronAPI?.assets) {
      throw new Error('Electron asset API not available')
    }

    const arrayBuffer = await file.arrayBuffer()
    const extension = file.name.split('.').pop() || 'bin'
    const filename = `${id}.${extension}`

    const result = await window.electronAPI.assets.saveFile(
      new Uint8Array(arrayBuffer),
      filename
    )

    if (!result.success) {
      throw new Error(result.error || 'Failed to save file')
    }

    return result.path!
  }

  private async deleteFromFilesystem(path: string): Promise<void> {
    if (!window.electronAPI?.assets) {
      return
    }

    const filename = path.split('/').pop() || path.split('\\').pop()
    if (filename) {
      await window.electronAPI.assets.deleteFile(filename)
    }
  }
}

// Export singleton
export const assetStorageManager = new AssetStorageManager()

// Export type
export type { AssetStorageManager }
