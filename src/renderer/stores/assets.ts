import { defineStore } from 'pinia'
import { assetStorageManager } from '@/services/assets/AssetStorage'
import { assetStorage, type Asset, type AssetType } from '@/services/database'

export type AssetFilter = 'all' | AssetType
export type AssetSortBy = 'name' | 'createdAt' | 'size' | 'type'

interface AssetsState {
  assets: Asset[]
  selectedAssetId: string | null
  filter: AssetFilter
  searchQuery: string
  sortBy: AssetSortBy
  sortAsc: boolean
  loading: boolean
  error: string | null
}

export const useAssetsStore = defineStore('assets', {
  state: (): AssetsState => ({
    assets: [],
    selectedAssetId: null,
    filter: 'all',
    searchQuery: '',
    sortBy: 'createdAt',
    sortAsc: false,
    loading: false,
    error: null,
  }),

  getters: {
    /**
     * Get filtered and sorted assets
     */
    filteredAssets(state): Asset[] {
      let result = [...state.assets]

      // Apply type filter
      if (state.filter !== 'all') {
        result = result.filter((a) => a.type === state.filter)
      }

      // Apply search query
      if (state.searchQuery.trim()) {
        const query = state.searchQuery.toLowerCase()
        result = result.filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.tags.some((t) => t.toLowerCase().includes(query))
        )
      }

      // Apply sorting
      result.sort((a, b) => {
        let cmp = 0
        switch (state.sortBy) {
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'createdAt':
            cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            break
          case 'size':
            cmp = a.size - b.size
            break
          case 'type':
            cmp = a.type.localeCompare(b.type)
            break
        }
        return state.sortAsc ? cmp : -cmp
      })

      return result
    },

    /**
     * Get selected asset
     */
    selectedAsset(state): Asset | undefined {
      return state.assets.find((a) => a.id === state.selectedAssetId)
    },

    /**
     * Get asset counts by type
     */
    assetCounts(state): Record<AssetFilter, number> {
      const counts: Record<AssetFilter, number> = {
        all: state.assets.length,
        image: 0,
        video: 0,
        audio: 0,
      }

      for (const asset of state.assets) {
        counts[asset.type]++
      }

      return counts
    },

    /**
     * Get total storage size
     */
    totalSize(state): number {
      return state.assets.reduce((sum, a) => sum + a.size, 0)
    },
  },

  actions: {
    /**
     * Load all assets from storage
     */
    async loadAssets() {
      this.loading = true
      this.error = null

      try {
        this.assets = await assetStorage.getAll()
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to load assets'
        console.error('[Assets Store] Load error:', error)
      } finally {
        this.loading = false
      }
    },

    /**
     * Upload a new asset from file
     */
    async uploadAsset(file: File): Promise<Asset | null> {
      this.loading = true
      this.error = null

      try {
        const asset = await assetStorageManager.uploadAsset(file)
        this.assets.push(asset)
        return asset
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to upload asset'
        console.error('[Assets Store] Upload error:', error)
        return null
      } finally {
        this.loading = false
      }
    },

    /**
     * Upload multiple files
     */
    async uploadAssets(files: FileList | File[]): Promise<Asset[]> {
      const uploaded: Asset[] = []

      for (const file of files) {
        const asset = await this.uploadAsset(file)
        if (asset) {
          uploaded.push(asset)
        }
      }

      return uploaded
    },

    /**
     * Upload from ImageData (e.g., from webcam snapshot)
     */
    async uploadFromImageData(imageData: ImageData, name: string): Promise<Asset | null> {
      this.loading = true
      this.error = null

      try {
        const asset = await assetStorageManager.uploadFromImageData(imageData, name)
        this.assets.push(asset)
        return asset
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to upload image data'
        console.error('[Assets Store] Upload error:', error)
        return null
      } finally {
        this.loading = false
      }
    },

    /**
     * Delete an asset
     */
    async deleteAsset(assetId: string): Promise<boolean> {
      try {
        await assetStorageManager.deleteAsset(assetId)
        this.assets = this.assets.filter((a) => a.id !== assetId)

        if (this.selectedAssetId === assetId) {
          this.selectedAssetId = null
        }

        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to delete asset'
        console.error('[Assets Store] Delete error:', error)
        return false
      }
    },

    /**
     * Update asset metadata
     */
    async updateAsset(
      assetId: string,
      updates: Partial<Pick<Asset, 'name' | 'tags'>>
    ): Promise<boolean> {
      try {
        await assetStorageManager.updateAsset(assetId, updates)

        const asset = this.assets.find((a) => a.id === assetId)
        if (asset) {
          Object.assign(asset, updates)
        }

        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to update asset'
        console.error('[Assets Store] Update error:', error)
        return false
      }
    },

    /**
     * Get URL for an asset
     */
    async getAssetUrl(assetId: string): Promise<string | null> {
      return assetStorageManager.getAssetUrl(assetId)
    },

    /**
     * Get thumbnail URL for an asset
     */
    async getThumbnailUrl(assetId: string): Promise<string | null> {
      return assetStorageManager.getThumbnailUrl(assetId)
    },

    /**
     * Select an asset
     */
    selectAsset(assetId: string | null) {
      this.selectedAssetId = assetId
    },

    /**
     * Set filter
     */
    setFilter(filter: AssetFilter) {
      this.filter = filter
    },

    /**
     * Set search query
     */
    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    /**
     * Set sort options
     */
    setSortBy(sortBy: AssetSortBy) {
      if (this.sortBy === sortBy) {
        // Toggle sort direction if same field
        this.sortAsc = !this.sortAsc
      } else {
        this.sortBy = sortBy
        this.sortAsc = sortBy === 'name' // Name sorts ascending by default
      }
    },

    /**
     * Get asset by ID
     */
    getAssetById(assetId: string): Asset | undefined {
      return this.assets.find((a) => a.id === assetId)
    },

    /**
     * Clear error
     */
    clearError() {
      this.error = null
    },
  },
})
